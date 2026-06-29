// AddiSafe-Adisense API gateway proxy.
//
// Responsibilities:
//   1. CORS resolution — the React frontend talks to /api/proxy/* on the
//      same origin instead of hitting PubChem/OpenFDA directly.
//   2. Caching — Redis when available (REDIS_URL), otherwise an in-memory
//      TTL cache so the gateway works on machines without a Redis server.
//      PubChem molecular data: 24h TTL. OpenFDA adverse events: 1h TTL.
//   3. Rate limiting — express-rate-limit on all /api routes to protect
//      upstream providers and this gateway from abuse.
//
// Run with: npm run server   (defaults to http://localhost:8787)

import express from "express";
import rateLimit from "express-rate-limit";
import { createClient } from "redis";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GATEWAY_PORT wins for local dev (PORT may be claimed by the frontend
// runner); PORT is honoured for cloud deployments that inject it.
const PORT = Number(process.env.GATEWAY_PORT || process.env.PORT || 8787);
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const TTL_PUBCHEM_SECONDS = Number(process.env.CACHE_TTL_PUBCHEM || 24 * 60 * 60); // 24 hours
const TTL_OPENFDA_SECONDS = Number(process.env.CACHE_TTL_OPENFDA || 60 * 60);      // 1 hour
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 10_000);

// ── Cache layer: Redis with transparent in-memory fallback ────────────────

class MemoryCache {
  constructor() { this.store = new Map(); }
  async get(key) {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) { this.store.delete(key); return null; }
    return hit.value;
  }
  async set(key, value, ttlSeconds) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

let cache = new MemoryCache();
let cacheBackend = "memory";

async function initRedis() {
  const client = createClient({
    url: REDIS_URL,
    socket: { connectTimeout: 2000, reconnectStrategy: false },
  });
  client.on("error", () => { /* handled by fallback */ });
  try {
    await client.connect();
    cache = {
      get: (key) => client.get(key),
      set: (key, value, ttlSeconds) => client.set(key, value, { EX: ttlSeconds }),
    };
    cacheBackend = "redis";
    console.log(`[cache] Connected to Redis at ${REDIS_URL}`);
  } catch {
    console.warn(`[cache] Redis unavailable at ${REDIS_URL} — using in-memory TTL cache`);
  }
}

// ── Upstream fetch with cache-first strategy ───────────────────────────────

async function cachedUpstream(cacheKey, ttlSeconds, upstreamUrl) {
  const hit = await cache.get(cacheKey);
  if (hit) return { ...JSON.parse(hit), cached: true };

  const res = await fetch(upstreamUrl, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  const body = await res.text();
  const entry = { status: res.status, body };
  // Cache successful responses and 404s (negative caching prevents
  // hammering upstream for additives that simply have no records).
  if (res.ok || res.status === 404) {
    await cache.set(cacheKey, JSON.stringify(entry), ttlSeconds);
  }
  return { ...entry, cached: false };
}

function sendProxied(res, result) {
  res
    .status(result.status)
    .set("X-Cache", result.cached ? "HIT" : "MISS")
    .type("application/json")
    .send(result.body);
}

// ── App ────────────────────────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1);

// Same-origin in production (static serve below) and the Vite dev server
// proxies /api — but allow cross-origin dev setups too.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/api/", rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
}));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, cache: cacheBackend, uptime: process.uptime() });
});

// PubChem PUG REST proxy — molecular data, 24h TTL
app.get("/api/proxy/pubchem/:name", async (req, res) => {
  const name = req.params.name.trim().toLowerCase();
  if (!name || name.length > 120) return res.status(400).json({ error: "Invalid compound name" });
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,IUPACName/JSON`;
    const result = await cachedUpstream(`pubchem:${name}`, TTL_PUBCHEM_SECONDS, url);
    sendProxied(res, result);
  } catch (e) {
    res.status(502).json({ error: "PubChem upstream failed", detail: String(e?.message ?? e) });
  }
});

// OpenFDA adverse event proxy — live regulatory records, 1h TTL
app.get("/api/proxy/openfda/:name", async (req, res) => {
  const name = req.params.name.trim().toLowerCase();
  if (!name || name.length > 120) return res.status(400).json({ error: "Invalid additive name" });
  try {
    const term = `"${name}"`;
    const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:${encodeURIComponent(term)}&limit=1`;
    const result = await cachedUpstream(`openfda:${name}`, TTL_OPENFDA_SECONDS, url);
    sendProxied(res, result);
  } catch (e) {
    res.status(502).json({ error: "OpenFDA upstream failed", detail: String(e?.message ?? e) });
  }
});

// Open Food Facts barcode proxy — product data, 1h TTL
app.get("/api/proxy/off/:barcode", async (req, res) => {
  const barcode = req.params.barcode.trim();
  if (!/^\d{6,14}$/.test(barcode)) return res.status(400).json({ error: "Invalid barcode" });
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;
    const result = await cachedUpstream(`off:${barcode}`, TTL_OPENFDA_SECONDS, url);
    sendProxied(res, result);
  } catch (e) {
    res.status(502).json({ error: "Open Food Facts upstream failed", detail: String(e?.message ?? e) });
  }
});

// Serve the production build when present (single-origin deployment)
const distDir = path.join(__dirname, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

initRedis().finally(() => {
  app.listen(PORT, () => {
    console.log(`AddiSafe-Adisense gateway listening on http://localhost:${PORT} (cache: ${cacheBackend})`);
  });
});
