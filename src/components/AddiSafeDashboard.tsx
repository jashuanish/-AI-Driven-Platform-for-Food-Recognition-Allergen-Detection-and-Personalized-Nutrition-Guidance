import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlaskConical, X, Plus, AlertTriangle, Activity, Network,
  Gauge, Beaker, Info, Sparkles, Loader2, Globe, Database, ScanBarcode,
} from "lucide-react";
import BarcodeScanner, { type BarcodeScanResult } from "./BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import NetworkGraph, { SEVERITY_COLORS, nodeColor } from "./NetworkGraph";
import {
  ADDITIVES, type Additive, findAdditive, computeRisk,
} from "@/src/lib/additives";
import { analyzeAdditives, type CocktailAnalysis } from "@/src/lib/additiveEngine";

const BAND_STYLES = {
  HIGH: { label: "HIGH", className: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" },
  MEDIUM: { label: "MEDIUM", className: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  LOW: { label: "LOW", className: "bg-destructive/15 text-destructive border-destructive/30" },
  "NO DATA": { label: "NO DATA", className: "bg-secondary text-muted-foreground border-border" },
} as const;

export default function AddiSafeDashboard({ initialAdditiveIds = [] }: { initialAdditiveIds?: string[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialAdditiveIds);
  const [query, setQuery] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live API orchestration (PubChem + OpenFDA via additiveEngine)
  const [live, setLive] = useState<CocktailAnalysis | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const liveKeyRef = useRef("");

  // Barcode scanning (Open Food Facts)
  const [showScanner, setShowScanner] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<{ name: string; brand: string; count: number } | null>(null);

  const handleBarcodeResult = ({ product, additives }: BarcodeScanResult) => {
    setShowScanner(false);
    setScannedProduct({ name: product.name, brand: product.brand, count: additives.length });
    if (additives.length) {
      setSelectedIds((prev) => [...new Set([...prev, ...additives.map((a) => a.id)])]);
    }
  };

  useEffect(() => {
    if (initialAdditiveIds.length) setSelectedIds(initialAdditiveIds);
  }, [initialAdditiveIds]);

  const selected = useMemo(
    () => selectedIds.map((id) => ADDITIVES.find((a) => a.id === id)).filter(Boolean) as Additive[],
    [selectedIds]
  );

  // Instant local analysis (graph + interaction list always work offline)
  const risk = useMemo(() => computeRisk(selected), [selected]);

  // Debounced live enrichment whenever the cocktail changes
  useEffect(() => {
    const key = selectedIds.join(",");
    liveKeyRef.current = key;
    if (selected.length === 0) {
      setLive(null);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    const timer = setTimeout(async () => {
      try {
        const analysis = await analyzeAdditives(selected.map((a) => a.name));
        if (liveKeyRef.current === key) setLive(analysis);
      } catch {
        if (liveKeyRef.current === key) setLive(null);
      } finally {
        if (liveKeyRef.current === key) setLiveLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefer live engine numbers when available, fall back to local KB
  const displayScore = live?.riskScore ?? risk.score;
  const displayConfidence = live?.confidence ?? risk.confidence;
  const displayBand = live?.band ?? risk.band;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ADDITIVES.filter(
      (a) =>
        !selectedIds.includes(a.id) &&
        (a.name.toLowerCase().includes(q) ||
          a.eCode?.toLowerCase().includes(q) ||
          a.aliases.some((al) => al.includes(q)))
    ).slice(0, 6);
  }, [query, selectedIds]);

  const addAdditive = (idOrQuery: string) => {
    const found = ADDITIVES.find((a) => a.id === idOrQuery) ?? findAdditive(idOrQuery);
    if (!found) {
      setInputError(`"${idOrQuery}" is not in the local knowledge base (22 core additives).`);
      return;
    }
    setInputError(null);
    setSelectedIds((prev) => (prev.includes(found.id) ? prev : [...prev, found.id]));
    setQuery("");
    inputRef.current?.focus();
  };

  const removeAdditive = (id: string) => setSelectedIds((prev) => prev.filter((x) => x !== id));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      addAdditive(suggestions[0]?.id ?? query);
    } else if (e.key === "Backspace" && !query && selectedIds.length) {
      removeAdditive(selectedIds[selectedIds.length - 1]);
    }
  };

  const scoreColor = displayScore >= 70 ? "#dc143c" : displayScore >= 45 ? "#ff9500" : displayScore >= 25 ? "#ffcc00" : "#34c759";
  const band = BAND_STYLES[displayBand];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {showScanner && (
        <BarcodeScanner onResult={handleBarcodeResult} onClose={() => setShowScanner(false)} />
      )}
      {/* Left column: input + risk panel */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="rounded-3xl border-border/60 shadow-lg shadow-black/5 bg-card/80 backdrop-blur-lg border">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm uppercase tracking-wider font-bold flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-primary" /> 1. Additive Cocktail
              </CardTitle>
              <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs font-bold shrink-0" onClick={() => setShowScanner(true)}>
                <ScanBarcode className="w-3.5 h-3.5 mr-1.5" /> Scan Barcode
              </Button>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Scan a product barcode, or type additive names / E-codes (e.g. Tartrazine, E102) and press Enter.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {scannedProduct && (
              <div className={`rounded-2xl p-3.5 border flex items-start gap-2.5 ${scannedProduct.count > 0 ? "bg-primary/5 border-primary/20" : "bg-secondary/40 border-border/60"}`}>
                <ScanBarcode className={`w-4 h-4 shrink-0 mt-0.5 ${scannedProduct.count > 0 ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{scannedProduct.brand ? `${scannedProduct.brand} · ` : ""}{scannedProduct.name}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                    {scannedProduct.count > 0
                      ? `${scannedProduct.count} known additive${scannedProduct.count > 1 ? "s" : ""} added to the cocktail below.`
                      : "No additives from our knowledge base were found in this product."}
                  </p>
                </div>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setScannedProduct(null)} aria-label="Dismiss">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Tags input */}
            <div
              className="flex flex-wrap items-center gap-2 min-h-[52px] p-2.5 rounded-2xl bg-secondary/30 border border-border/80 shadow-inner cursor-text focus-within:ring-2 focus-within:ring-primary/40"
              onClick={() => inputRef.current?.focus()}
            >
              {selected.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-bold border"
                  style={{ color: nodeColor(a.riskIndex), borderColor: `${nodeColor(a.riskIndex)}55`, backgroundColor: `${nodeColor(a.riskIndex)}1a` }}
                >
                  {a.name}{a.eCode ? ` · ${a.eCode}` : ""}
                  <button
                    className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    onClick={(e) => { e.stopPropagation(); removeAdditive(a.id); }}
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setInputError(null); }}
                onKeyDown={handleKeyDown}
                placeholder={selected.length ? "Add another…" : "e.g. Tartrazine, E102…"}
                className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm font-medium placeholder:text-muted-foreground/60"
              />
            </div>

            {inputError && (
              <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0" /> {inputError}
              </p>
            )}

            {/* Autocomplete suggestions */}
            {suggestions.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
                {suggestions.map((a) => (
                  <button
                    key={a.id}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-secondary/60 transition-colors"
                    onClick={() => addAdditive(a.id)}
                  >
                    <span className="text-sm font-semibold">{a.name}</span>
                    <span className="flex items-center gap-2">
                      {a.eCode && <Badge variant="outline" className="text-[10px] font-bold">{a.eCode}</Badge>}
                      <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick-add chips */}
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Quick add</div>
              <div className="flex flex-wrap gap-1.5">
                {ADDITIVES.filter((a) => !selectedIds.includes(a.id)).slice(0, 10).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => addAdditive(a.id)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    {a.eCode ?? a.name}
                  </button>
                ))}
              </div>
            </div>

            {selected.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setSelectedIds([])}>
                Clear all
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Risk Score panel */}
        <Card className="rounded-3xl border-border/60 shadow-lg shadow-black/5 bg-card/80 backdrop-blur-lg border overflow-hidden">
          <CardHeader className="border-b border-border/50 pb-4 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm uppercase tracking-wider font-bold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" /> 2. Composite Risk Index
            </CardTitle>
            {liveLoading ? (
              <Badge variant="outline" className="text-[9px] font-black tracking-widest text-muted-foreground gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> QUERYING APIS
              </Badge>
            ) : live ? (
              <Badge variant="outline" className="text-[9px] font-black tracking-widest text-primary border-primary/30 bg-primary/10 gap-1.5">
                <Globe className="w-3 h-3" /> LIVE DATA
              </Badge>
            ) : selected.length > 0 ? (
              <Badge variant="outline" className="text-[9px] font-black tracking-widest text-muted-foreground gap-1.5">
                <Database className="w-3 h-3" /> LOCAL KB
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              {/* Radial gauge */}
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="var(--secondary)" strokeWidth="10" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={scoreColor} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(displayScore / 100) * 263.9} 263.9`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black tracking-tighter" style={{ color: scoreColor }}>{displayScore}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">/ 100</span>
                </div>
              </div>
              <div className="space-y-3 flex-1">
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Data Confidence Band</div>
                  <Badge variant="outline" className={`font-black text-[11px] tracking-widest px-3 py-1 rounded-lg ${band.className}`}>
                    {band.label}{displayBand !== "NO DATA" ? ` · ${displayConfidence}%` : ""}
                  </Badge>
                </div>
                <div className="flex gap-4 text-xs font-bold">
                  <span className="flex items-center gap-1.5" style={{ color: SEVERITY_COLORS.DANGEROUS }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.DANGEROUS }} />
                    {risk.dangerousCount} Dangerous
                  </span>
                  <span className="flex items-center gap-1.5" style={{ color: SEVERITY_COLORS.MODERATE }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.MODERATE }} />
                    {risk.moderateCount} Moderate
                  </span>
                </div>
              </div>
            </div>

            {risk.dangerousCount > 0 && (
              <div className="mt-5 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-xs font-bold leading-relaxed">
                  This combination contains {risk.dangerousCount} documented dangerous interaction{risk.dangerousCount > 1 ? "s" : ""}. Review the mechanism details below.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live source data (PubChem + OpenFDA) */}
        {live && live.resolutions.length > 0 && (
          <Card className="rounded-3xl border-border/60 shadow-lg shadow-black/5 bg-card/80 backdrop-blur-lg border">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-sm uppercase tracking-wider font-bold flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Live Source Data
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Resolved against PubChem PUG REST and the OpenFDA adverse event API.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {live.resolutions.map((r, i) => {
                  const rb = BAND_STYLES[r.band];
                  return (
                    <div key={i} className="p-4 rounded-2xl bg-secondary/30 border border-border/60">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-bold">{r.additive?.name ?? r.query}</span>
                        <Badge variant="outline" className={`text-[9px] font-black tracking-widest shrink-0 ${rb.className}`}>
                          {rb.label}{r.band !== "NO DATA" ? ` ${r.confidence}%` : ""}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-semibold text-muted-foreground">
                        <span>PubChem CID: <span className="text-foreground">{r.pubchem?.cid ?? "—"}</span></span>
                        <span>Formula: <span className="text-foreground">{r.pubchem?.molecularFormula ?? "—"}</span></span>
                        <span className="col-span-2 truncate">IUPAC: <span className="text-foreground">{r.pubchem?.iupacName ?? "—"}</span></span>
                        <span className="col-span-2">FDA adverse event reports: <span className="text-foreground">{r.fdaReports === null ? "unavailable" : r.fdaReports.toLocaleString()}</span></span>
                      </div>
                      <div className="mt-2.5 flex gap-1.5">
                        {(["pubchem", "openfda", "localKB"] as const).map((src) => (
                          <span
                            key={src}
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                              r.sources[src]
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-secondary text-muted-foreground/50 border-border/60 line-through"
                            }`}
                          >
                            {src === "localKB" ? "Local KB" : src === "pubchem" ? "PubChem" : "OpenFDA"}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Interaction details */}
        {risk.interactions.length > 0 && (
          <Card className="rounded-3xl border-border/60 shadow-lg shadow-black/5 bg-card/80 backdrop-blur-lg border">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-sm uppercase tracking-wider font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Interaction Mechanisms
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ScrollArea className="max-h-[320px]">
                <div className="space-y-3 pr-2">
                  {risk.interactions.map((it, i) => {
                    const [a, b] = it.pair.map((id) => ADDITIVES.find((x) => x.id === id)!);
                    return (
                      <div
                        key={i}
                        className="p-4 rounded-2xl border"
                        style={{ borderColor: `${SEVERITY_COLORS[it.severity]}33`, backgroundColor: `${SEVERITY_COLORS[it.severity]}0d` }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-black tracking-wide" style={{ color: SEVERITY_COLORS[it.severity] }}>
                            {a.name} + {b.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] font-black tracking-widest shrink-0"
                            style={{ color: SEVERITY_COLORS[it.severity], borderColor: `${SEVERITY_COLORS[it.severity]}55` }}
                          >
                            {it.severity}
                          </Badge>
                        </div>
                        <p className="text-xs font-semibold text-foreground/85 leading-relaxed">{it.mechanism}</p>
                        <div className="mt-2.5 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                          <span className="truncate pr-2">{it.source}</span>
                          <span className="shrink-0">Confidence {it.confidence}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right column: network graph */}
      <div className="lg:col-span-8">
        <Card className="rounded-3xl border-border/60 shadow-lg shadow-black/5 bg-card/80 backdrop-blur-lg border h-full flex flex-col">
          <CardHeader className="border-b border-border/50 pb-4 flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm uppercase tracking-wider font-bold flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" /> Interaction Network
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Drag nodes to explore. Edges appear only between additives with a documented interaction.
              </CardDescription>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5" style={{ color: SEVERITY_COLORS.DANGEROUS }}>
                <span className="w-6 h-1 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.DANGEROUS }} /> Dangerous
              </span>
              <span className="flex items-center gap-1.5" style={{ color: SEVERITY_COLORS.MODERATE }}>
                <span className="w-6 h-1 rounded-full border-b-2 border-dashed" style={{ borderColor: SEVERITY_COLORS.MODERATE }} /> Moderate
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-2 min-h-[460px]">
            {selected.length === 0 ? (
              <div className="h-full min-h-[420px] flex flex-col items-center justify-center text-center p-8">
                <div className="w-24 h-24 bg-secondary/50 rounded-[2rem] flex items-center justify-center mb-6 border border-border/80">
                  <Beaker className="w-10 h-10 text-muted-foreground/60" />
                </div>
                <h3 className="text-xl font-black tracking-tight">No additives selected</h3>
                <p className="mt-3 text-sm font-medium text-muted-foreground max-w-sm leading-relaxed">
                  Add two or more additives to map their chemical interaction network. Try the classic pair: <button className="text-primary font-bold underline-offset-2 hover:underline" onClick={() => setSelectedIds(["sodium-benzoate", "ascorbic-acid", "tartrazine"]) }>Sodium Benzoate + Vitamin C + Tartrazine</button>
                </p>
              </div>
            ) : (
              <NetworkGraph additives={selected} interactions={risk.interactions} />
            )}
          </CardContent>
          {selected.length === 1 && (
            <div className="px-6 pb-5 -mt-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Add at least one more additive to check for interaction pairs.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
