import { useMemo } from "react";
import { FlaskConical, AlertTriangle, ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import NetworkGraph, { SEVERITY_COLORS } from "./NetworkGraph";
import { ADDITIVES, type Additive, computeRisk } from "@/src/lib/additives";

export interface DetectedAdditive {
  additive: Additive;
  /** Exact label text this additive was detected from, e.g. "Acidifying agent (330)" */
  source: string;
}

/**
 * Automatic chemical-interaction analysis embedded in the scan report.
 * Runs instantly on the local knowledge base — no extra click required.
 */
export default function InteractionReport({ detected, onOpenLab }: { detected: DetectedAdditive[]; onOpenLab: () => void }) {
  const additives = useMemo(() => detected.map((d) => d.additive), [detected]);
  const risk = useMemo(() => computeRisk(additives), [additives]);

  if (additives.length === 0) return null;

  const scoreColor = risk.score >= 70 ? "#dc143c" : risk.score >= 45 ? "#ff9500" : risk.score >= 25 ? "#ffcc00" : "#34c759";

  return (
    <div className="col-span-full bg-card border border-border/80 rounded-[2.5rem] p-6 md:p-8 shadow-sm backdrop-blur-2xl overflow-hidden relative">
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Chemical Interaction Analysis</h3>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {additives.length} known additive{additives.length > 1 ? "s" : ""} detected in this label — analyzed automatically
            </p>
          </div>
        </div>
        <Button onClick={onOpenLab} variant="outline" className="rounded-2xl font-bold shrink-0">
          Open in Interaction Lab
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        {/* Risk summary */}
        <div className="space-y-4">
          <div className="flex items-center gap-5 p-5 rounded-3xl bg-secondary/30 border border-border/60">
            <div className="relative w-24 h-24 shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--secondary)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={scoreColor} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${(risk.score / 100) * 263.9} 263.9`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black tracking-tighter" style={{ color: scoreColor }}>{risk.score}</span>
                <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Risk</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: SEVERITY_COLORS.DANGEROUS }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.DANGEROUS }} />
                {risk.dangerousCount} Dangerous
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: SEVERITY_COLORS.MODERATE }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS.MODERATE }} />
                {risk.moderateCount} Moderate
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {detected.map(({ additive: a, source }) => (
                  <Badge key={a.id} variant="outline" className="text-[9px] font-bold" title={`From label: ${source}`}>{a.eCode ?? a.name}</Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Traceability: exact label text each additive was detected from */}
          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Detected from the label</div>
            {detected.map(({ additive: a, source }) => (
              <div key={a.id} className="text-[11px] font-semibold leading-relaxed">
                <span className="text-foreground">{a.name}{a.eCode ? ` (${a.eCode})` : ""}</span>
                <span className="text-muted-foreground"> ← “{source}”</span>
              </div>
            ))}
          </div>

          {risk.interactions.length === 0 ? (
            <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 flex gap-3">
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-xs font-bold leading-relaxed">No documented interaction pairs between the additives in this product.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {risk.interactions.map((it, i) => {
                const [a, b] = it.pair.map((id) => ADDITIVES.find((x) => x.id === id)!);
                return (
                  <div
                    key={i}
                    className="p-3.5 rounded-2xl border"
                    style={{ borderColor: `${SEVERITY_COLORS[it.severity]}33`, backgroundColor: `${SEVERITY_COLORS[it.severity]}0d` }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {it.severity === "DANGEROUS" && <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: SEVERITY_COLORS.DANGEROUS }} />}
                      <span className="text-[11px] font-black tracking-wide" style={{ color: SEVERITY_COLORS[it.severity] }}>
                        {a.name} + {b.name} · {it.severity}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-foreground/80 leading-relaxed">{it.mechanism}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Embedded network graph */}
        <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-secondary/20 min-h-[340px]">
          <NetworkGraph additives={additives} interactions={risk.interactions} />
        </div>
      </div>
    </div>
  );
}
