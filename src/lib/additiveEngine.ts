// AddiSafe Phase 1 — live data orchestration engine.
//
// For each additive in the cocktail this module:
//   1. Resolves the canonical compound on PubChem PUG REST (CID, molecular
//      formula, IUPAC name).
//   2. Counts adverse-event reports on the OpenFDA drug event API.
//   3. Matches against the local knowledge base (additives.ts).
// Every request carries an AbortSignal timeout so a dead endpoint can never
// hang the UI; a failed source simply drops out of the confidence average.
//
// Confidence (weighted average of the sources that resolved):
//   PubChem 0.85 · OpenFDA 0.75 (only if reports found) · LocalKB 0.70
//   HIGH >= 70% · MEDIUM 40-69% · LOW < 40% · NO DATA when nothing resolves.
//
// Risk: highest base risk index among selected compounds, then each
// DANGEROUS pair applies a +0.28x multiplier (MODERATE +0.12x), capped at 100.

import {
  ADDITIVES, INTERACTIONS, type Additive, type Interaction,
  type ConfidenceBand, findAdditive, getConfidenceBand,
} from "./additives";

const REQUEST_TIMEOUT_MS = 8000;

const SOURCE_WEIGHTS = {
  pubchem: 0.85,
  openfda: 0.75,
  localKB: 0.70,
} as const;

const DANGEROUS_MULTIPLIER = 0.28;
const MODERATE_MULTIPLIER = 0.12;
const UNKNOWN_COMPOUND_BASE_RISK = 30; // additive not in local KB: unverified baseline

export interface PubChemCompound {
  cid: number;
  molecularFormula: string;
  iupacName: string;
}

export interface AdditiveResolution {
  query: string;
  /** Local knowledge-base match, if any */
  additive: Additive | null;
  pubchem: PubChemCompound | null;
  /** Adverse event report count; null = endpoint unreachable/failed */
  fdaReports: number | null;
  confidence: number; // 0-100
  band: ConfidenceBand;
  sources: { pubchem: boolean; openfda: boolean; localKB: boolean };
  errors: string[];
}

export interface CocktailAnalysis {
  resolutions: AdditiveResolution[];
  interactions: Interaction[];
  riskScore: number;   // 0-100, capped
  baseRisk: number;    // highest individual base risk
  confidence: number;  // 0-100 overall
  band: ConfidenceBand;
  dangerousCount: number;
  moderateCount: number;
}

async function fetchJson(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

// ── Gateway proxy detection ────────────────────────────────────────────────
// When the Express gateway (server.js) is up, route lookups through
// /api/proxy/* to get Redis caching, rate limiting, and CORS-free requests.
// Probed once per session; offline gateway falls back to direct upstreams.

let gatewayProbe: Promise<boolean> | null = null;

export function isGatewayAvailable(): Promise<boolean> {
  if (!gatewayProbe) {
    gatewayProbe = fetch("/api/health", { signal: AbortSignal.timeout(2500) })
      .then((r) => r.ok)
      .catch(() => false);
  }
  return gatewayProbe;
}

async function fetchPubChem(name: string): Promise<PubChemCompound | null> {
  const direct = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,IUPACName/JSON`;
  const url = (await isGatewayAvailable())
    ? `/api/proxy/pubchem/${encodeURIComponent(name)}`
    : direct;
  const data = await fetchJson(url);
  const prop = data?.PropertyTable?.Properties?.[0];
  if (!prop?.CID) return null;
  return {
    cid: prop.CID,
    molecularFormula: prop.MolecularFormula ?? "—",
    iupacName: prop.IUPACName ?? "—",
  };
}

async function fetchOpenFdaReportCount(name: string): Promise<number> {
  const term = `"${name.toLowerCase()}"`;
  const direct = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:${encodeURIComponent(term)}&limit=1`;
  const url = (await isGatewayAvailable())
    ? `/api/proxy/openfda/${encodeURIComponent(name.toLowerCase())}`
    : direct;
  try {
    const data = await fetchJson(url);
    return data?.meta?.results?.total ?? 0;
  } catch (e: any) {
    // OpenFDA answers 404 NOT_FOUND when the query simply has no matches —
    // that is a successful lookup with zero reports, not a failure.
    if (String(e?.message).includes("404")) return 0;
    throw e;
  }
}

async function resolveAdditive(query: string): Promise<AdditiveResolution> {
  const additive = findAdditive(query) ?? null;
  const lookupName = additive?.name ?? query;
  const errors: string[] = [];

  const [pubchemResult, fdaResult] = await Promise.allSettled([
    fetchPubChem(lookupName),
    fetchOpenFdaReportCount(lookupName),
  ]);

  const pubchem = pubchemResult.status === "fulfilled" ? pubchemResult.value : null;
  if (pubchemResult.status === "rejected") errors.push(`PubChem: ${pubchemResult.reason?.message ?? "failed"}`);

  const fdaReports = fdaResult.status === "fulfilled" ? fdaResult.value : null;
  if (fdaResult.status === "rejected") errors.push(`OpenFDA: ${fdaResult.reason?.message ?? "failed"}`);

  const sources = {
    pubchem: pubchem !== null,
    openfda: (fdaReports ?? 0) > 0, // weight only counts when reports were found
    localKB: additive !== null,
  };

  const activeWeights = (Object.keys(sources) as (keyof typeof sources)[])
    .filter((k) => sources[k])
    .map((k) => SOURCE_WEIGHTS[k]);

  const confidence = activeWeights.length
    ? Math.round((activeWeights.reduce((s, w) => s + w, 0) / activeWeights.length) * 100)
    : 0;

  return {
    query,
    additive,
    pubchem,
    fdaReports,
    confidence,
    band: getConfidenceBand(confidence),
    sources,
    errors,
  };
}

function evaluateInteractions(additives: (Additive | null)[]): Interaction[] {
  const ids = new Set(additives.filter(Boolean).map((a) => a!.id));
  return INTERACTIONS.filter((i) => ids.has(i.pair[0]) && ids.has(i.pair[1]));
}

/**
 * Analyze a cocktail of additive names/E-codes against live sources plus
 * the local interaction map. Never throws for individual endpoint failures —
 * degraded sources just lower the confidence band.
 */
export async function analyzeAdditives(names: string[]): Promise<CocktailAnalysis> {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return {
      resolutions: [], interactions: [], riskScore: 0, baseRisk: 0,
      confidence: 0, band: "NO DATA", dangerousCount: 0, moderateCount: 0,
    };
  }

  const resolutions = await Promise.all(cleaned.map((n) => resolveAdditive(n)));

  const interactions = evaluateInteractions(resolutions.map((r) => r.additive));
  const dangerousCount = interactions.filter((i) => i.severity === "DANGEROUS").length;
  const moderateCount = interactions.length - dangerousCount;

  const baseRisk = Math.max(
    ...resolutions.map((r) => r.additive?.riskIndex ?? UNKNOWN_COMPOUND_BASE_RISK)
  );

  const multiplier = 1 + dangerousCount * DANGEROUS_MULTIPLIER + moderateCount * MODERATE_MULTIPLIER;
  const riskScore = Math.min(100, Math.round(baseRisk * multiplier));

  const confidence = Math.round(
    resolutions.reduce((s, r) => s + r.confidence, 0) / resolutions.length
  );

  return {
    resolutions,
    interactions,
    riskScore,
    baseRisk,
    confidence,
    band: getConfidenceBand(confidence),
    dangerousCount,
    moderateCount,
  };
}
