// AddiSafe local knowledge base — core 22 additives with baseline risk
// indices plus documented pairwise interactions. Used for instant
// client-side analysis (no network round-trip required).

export type Severity = "DANGEROUS" | "MODERATE";

export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW" | "NO DATA";

export interface Additive {
  id: string;          // stable slug
  name: string;        // display name
  eCode: string | null;
  category: string;
  riskIndex: number;   // 0-100 baseline risk
  aliases: string[];   // lowercase match terms (names, e-codes, synonyms)
}

export interface Interaction {
  pair: [string, string];  // additive ids
  severity: Severity;
  mechanism: string;
  confidence: number;      // 0-100 data confidence
  source: string;
}

export const ADDITIVES: Additive[] = [
  { id: "sodium-nitrite", name: "Sodium Nitrite", eCode: "E250", category: "Preservative (cured meats)", riskIndex: 80, aliases: ["sodium nitrite", "e250", "nitrite"] },
  { id: "sodium-nitrate", name: "Sodium Nitrate", eCode: "E251", category: "Preservative (cured meats)", riskIndex: 72, aliases: ["sodium nitrate", "e251", "nitrate", "saltpeter"] },
  { id: "sodium-benzoate", name: "Sodium Benzoate", eCode: "E211", category: "Preservative (acidic foods)", riskIndex: 55, aliases: ["sodium benzoate", "e211", "benzoate of soda"] },
  { id: "potassium-benzoate", name: "Potassium Benzoate", eCode: "E212", category: "Preservative (beverages)", riskIndex: 52, aliases: ["potassium benzoate", "e212"] },
  { id: "tartrazine", name: "Tartrazine", eCode: "E102", category: "Azo dye (yellow)", riskIndex: 45, aliases: ["tartrazine", "e102", "yellow 5", "fd&c yellow no. 5", "fd&c yellow 5"] },
  { id: "sunset-yellow", name: "Sunset Yellow FCF", eCode: "E110", category: "Azo dye (orange)", riskIndex: 48, aliases: ["sunset yellow", "sunset yellow fcf", "e110", "yellow 6", "fd&c yellow 6"] },
  { id: "allura-red", name: "Allura Red AC", eCode: "E129", category: "Azo dye (red)", riskIndex: 50, aliases: ["allura red", "allura red ac", "e129", "red 40", "fd&c red 40"] },
  { id: "carmoisine", name: "Carmoisine", eCode: "E122", category: "Azo dye (red)", riskIndex: 47, aliases: ["carmoisine", "azorubine", "e122"] },
  { id: "ponceau-4r", name: "Ponceau 4R", eCode: "E124", category: "Azo dye (red)", riskIndex: 46, aliases: ["ponceau 4r", "ponceau", "e124", "cochineal red a"] },
  { id: "quinoline-yellow", name: "Quinoline Yellow", eCode: "E104", category: "Synthetic dye (yellow)", riskIndex: 44, aliases: ["quinoline yellow", "e104"] },
  { id: "brilliant-blue", name: "Brilliant Blue FCF", eCode: "E133", category: "Synthetic dye (blue)", riskIndex: 35, aliases: ["brilliant blue", "brilliant blue fcf", "e133", "blue 1", "fd&c blue 1"] },
  { id: "aspartame", name: "Aspartame", eCode: "E951", category: "Artificial sweetener", riskIndex: 40, aliases: ["aspartame", "e951", "nutrasweet", "equal"] },
  { id: "acesulfame-k", name: "Acesulfame Potassium", eCode: "E950", category: "Artificial sweetener", riskIndex: 35, aliases: ["acesulfame potassium", "acesulfame k", "acesulfame-k", "ace-k", "e950"] },
  { id: "sucralose", name: "Sucralose", eCode: "E955", category: "Artificial sweetener", riskIndex: 30, aliases: ["sucralose", "e955", "splenda"] },
  { id: "msg", name: "Monosodium Glutamate", eCode: "E621", category: "Flavour enhancer", riskIndex: 38, aliases: ["monosodium glutamate", "msg", "e621", "glutamate"] },
  { id: "bha", name: "Butylated Hydroxyanisole (BHA)", eCode: "E320", category: "Synthetic antioxidant", riskIndex: 65, aliases: ["bha", "butylated hydroxyanisole", "e320"] },
  { id: "bht", name: "Butylated Hydroxytoluene (BHT)", eCode: "E321", category: "Synthetic antioxidant", riskIndex: 60, aliases: ["bht", "butylated hydroxytoluene", "e321"] },
  { id: "tbhq", name: "TBHQ", eCode: "E319", category: "Synthetic antioxidant", riskIndex: 62, aliases: ["tbhq", "tertiary butylhydroquinone", "tert-butylhydroquinone", "e319"] },
  { id: "ascorbic-acid", name: "Ascorbic Acid", eCode: "E300", category: "Antioxidant (Vitamin C)", riskIndex: 5, aliases: ["ascorbic acid", "e300", "vitamin c"] },
  { id: "citric-acid", name: "Citric Acid", eCode: "E330", category: "Acidity regulator", riskIndex: 8, aliases: ["citric acid", "e330"] },
  { id: "sulfur-dioxide", name: "Sulfur Dioxide", eCode: "E220", category: "Preservative (sulfite)", riskIndex: 58, aliases: ["sulfur dioxide", "sulphur dioxide", "e220", "sulfites", "sulphites", "sodium sulfite", "sodium metabisulfite", "e221", "e223"] },
  { id: "carrageenan", name: "Carrageenan", eCode: "E407", category: "Thickener / emulsifier", riskIndex: 42, aliases: ["carrageenan", "e407", "irish moss extract"] },
];

export const INTERACTIONS: Interaction[] = [
  {
    pair: ["sodium-benzoate", "ascorbic-acid"],
    severity: "DANGEROUS",
    mechanism: "Benzoate + ascorbic acid can react to form benzene, a known human carcinogen, especially under heat and light exposure in beverages.",
    confidence: 92,
    source: "FDA benzene-in-beverages survey; Gardner & Lawrence (1993)",
  },
  {
    pair: ["potassium-benzoate", "ascorbic-acid"],
    severity: "DANGEROUS",
    mechanism: "Potassium benzoate undergoes the same decarboxylation pathway as sodium benzoate in the presence of ascorbic acid, producing benzene.",
    confidence: 88,
    source: "FDA benzene-in-beverages survey",
  },
  {
    pair: ["tartrazine", "sodium-benzoate"],
    severity: "DANGEROUS",
    mechanism: "Combination linked to significantly increased hyperactivity in children versus either compound alone (Southampton study mix).",
    confidence: 85,
    source: "McCann et al., The Lancet (2007); EFSA review",
  },
  {
    pair: ["sodium-benzoate", "aspartame"],
    severity: "DANGEROUS",
    mechanism: "Benzene liberation pathway: benzoate decarboxylation in acidic sweetened beverages can liberate benzene; co-formulation with aspartame is flagged in the AddiSafe spec as a dangerous combination.",
    confidence: 62,
    source: "AddiSafe interaction map; FDA benzene-in-beverages survey",
  },
  {
    pair: ["aspartame", "msg"],
    severity: "MODERATE",
    mechanism: "Excitotoxin amplification: aspartate (from aspartame) and glutamate (from MSG) act on the same NMDA receptor pathways; combined intake may amplify excitatory load.",
    confidence: 48,
    source: "AddiSafe interaction map; excitotoxicity literature (Olney)",
  },
  {
    pair: ["sunset-yellow", "sodium-benzoate"],
    severity: "MODERATE",
    mechanism: "Part of the Southampton study mixture associated with increased hyperactivity scores in children.",
    confidence: 78,
    source: "McCann et al., The Lancet (2007)",
  },
  {
    pair: ["allura-red", "sodium-benzoate"],
    severity: "MODERATE",
    mechanism: "Azo dye + benzoate combinations associated with behavioural effects in children in randomized trials.",
    confidence: 74,
    source: "McCann et al., The Lancet (2007)",
  },
  {
    pair: ["carmoisine", "sodium-benzoate"],
    severity: "MODERATE",
    mechanism: "Carmoisine was a component of the Southampton mixtures associated with increased hyperactivity.",
    confidence: 72,
    source: "McCann et al., The Lancet (2007)",
  },
  {
    pair: ["ponceau-4r", "sodium-benzoate"],
    severity: "MODERATE",
    mechanism: "Ponceau 4R was a component of the Southampton mixtures associated with increased hyperactivity.",
    confidence: 70,
    source: "McCann et al., The Lancet (2007)",
  },
  {
    pair: ["quinoline-yellow", "sodium-benzoate"],
    severity: "MODERATE",
    mechanism: "Quinoline Yellow was a component of the Southampton study mixture B linked to behavioural effects.",
    confidence: 68,
    source: "McCann et al., The Lancet (2007)",
  },
  {
    pair: ["tartrazine", "sunset-yellow"],
    severity: "MODERATE",
    mechanism: "Co-occurring azo dyes show additive genotoxic and behavioural effect signals in animal and cell studies; cumulative azo load.",
    confidence: 55,
    source: "EFSA azo dye re-evaluations (2009)",
  },
  {
    pair: ["sodium-nitrite", "sodium-nitrate"],
    severity: "MODERATE",
    mechanism: "Nitrate reduces to nitrite in vivo; combined intake raises the total nitrosating pool and potential N-nitrosamine formation.",
    confidence: 76,
    source: "IARC Monograph 94; EFSA nitrite/nitrate opinion (2017)",
  },
  {
    pair: ["bha", "bht"],
    severity: "MODERATE",
    mechanism: "Co-administration shows synergistic oxidative stress and liver enzyme changes in rodent studies beyond either antioxidant alone.",
    confidence: 60,
    source: "NTP toxicology reports; rodent co-exposure studies",
  },
  {
    pair: ["bha", "sodium-nitrite"],
    severity: "MODERATE",
    mechanism: "BHA can modulate nitrosamine formation chemistry; co-exposure in cured products shows mixed tumour-promotion signals in animal models.",
    confidence: 45,
    source: "Animal co-exposure studies (limited)",
  },
  {
    pair: ["aspartame", "acesulfame-k"],
    severity: "MODERATE",
    mechanism: "Frequently blended sweeteners; combined chronic exposure studies suggest additive metabolic and microbiome effect signals.",
    confidence: 50,
    source: "Sweetener blend metabolic studies (emerging)",
  },
  {
    pair: ["msg", "tartrazine"],
    severity: "MODERATE",
    mechanism: "Rodent co-exposure studies report amplified neurobehavioural and oxidative effects relative to single exposure.",
    confidence: 42,
    source: "Rodent co-exposure studies (limited)",
  },
];

export function getConfidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 70) return "HIGH";
  if (confidence >= 40) return "MEDIUM";
  if (confidence >= 1) return "LOW";
  return "NO DATA";
}

export function findAdditive(query: string): Additive | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  // INS/E numbers in any common label form: "330", "E330", "INS 330",
  // "150d", "500(ii)" — resolve by exact E-code only.
  const ins = q.match(/^(?:e|ins)?[\s-]?(\d{3,4})([a-z])?(?:\s*\([ivx]+\))?$/);
  if (ins) {
    const code = `e${ins[1]}${ins[2] ?? ""}`;
    return ADDITIVES.find((a) => a.eCode?.toLowerCase() === code);
  }
  return (
    ADDITIVES.find((a) => a.id === q || a.eCode?.toLowerCase() === q) ||
    ADDITIVES.find((a) => a.aliases.includes(q)) ||
    ADDITIVES.find((a) => a.name.toLowerCase() === q) ||
    (q.length >= 4
      ? ADDITIVES.find((a) => a.aliases.some((al) => al.length >= 4 && (al.includes(q) || q.includes(al))))
      : undefined)
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scan label text for known additives. Matches whole words/phrases and
 * E/INS-coded numbers ("E330", "INS 211", bracketed "(330)", "(150d)",
 * "(500(ii))"). Bare numbers are never matched — they collide with
 * nutrition values like "Energy 402" or "Sodium 211mg".
 */
export function detectAdditives(text: string): Additive[] {
  const t = text.toLowerCase();
  const found = new Map<string, Additive>();

  for (const a of ADDITIVES) {
    const hit = a.aliases.some((al) =>
      new RegExp(`(^|[^a-z0-9])${escapeRegex(al)}(?=$|[^a-z0-9])`).test(t)
    );
    if (hit) found.set(a.id, a);
  }

  const codePatterns = [
    /\b(?:e|ins)[\s-]?(\d{3,4})([a-z])?\b/g,           // E330, INS 211
    /\(\s*(\d{3,4})([a-z])?\s*(?:\([ivx]+\))?\s*\)/g,  // (330), (150d), (500(ii))
  ];
  for (const pattern of codePatterns) {
    for (const m of t.matchAll(pattern)) {
      const code = `e${m[1]}${m[2] ?? ""}`;
      const match = ADDITIVES.find((a) => a.eCode?.toLowerCase() === code);
      if (match) found.set(match.id, match);
    }
  }

  return [...found.values()];
}

export function getInteractions(ids: string[]): Interaction[] {
  const set = new Set(ids);
  return INTERACTIONS.filter((x) => set.has(x.pair[0]) && set.has(x.pair[1]));
}

export interface RiskResult {
  score: number;          // 0-100 composite risk
  confidence: number;     // 0-100 data confidence
  band: ConfidenceBand;
  interactions: Interaction[];
  dangerousCount: number;
  moderateCount: number;
}

/**
 * Composite risk — same formula as the live engine (additiveEngine.ts) so
 * the scan report and the Interaction Lab always agree: the worst additive
 * sets the base, then every documented DANGEROUS pair multiplies it by
 * +0.28x (MODERATE +0.12x), capped at 100.
 */
export function computeRisk(additives: Additive[]): RiskResult {
  if (additives.length === 0) {
    return { score: 0, confidence: 0, band: "NO DATA", interactions: [], dangerousCount: 0, moderateCount: 0 };
  }
  const interactions = getInteractions(additives.map((a) => a.id));
  const maxBase = Math.max(...additives.map((a) => a.riskIndex));

  const dangerousCount = interactions.filter((i) => i.severity === "DANGEROUS").length;
  const moderateCount = interactions.length - dangerousCount;

  const multiplier = 1 + dangerousCount * 0.28 + moderateCount * 0.12;
  const score = Math.min(100, Math.round(maxBase * multiplier));

  // Confidence: baseline data confidence for known additives, raised by
  // well-documented interactions present in the selection.
  const baselineConfidence = 55;
  const confidence = interactions.length
    ? Math.round(interactions.reduce((s, i) => s + i.confidence, 0) / interactions.length)
    : baselineConfidence;

  return { score, confidence, band: getConfidenceBand(confidence), interactions, dangerousCount, moderateCount };
}
