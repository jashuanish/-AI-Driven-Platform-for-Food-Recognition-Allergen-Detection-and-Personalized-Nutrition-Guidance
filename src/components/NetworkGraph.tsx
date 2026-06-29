import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { Additive, Interaction } from "@/src/lib/additives";

export const SEVERITY_COLORS: Record<Interaction["severity"], string> = {
  DANGEROUS: "#dc143c", // crimson
  MODERATE: "#ff9500",  // amber
};

export function nodeColor(risk: number): string {
  if (risk >= 70) return "#dc143c";
  if (risk >= 45) return "#ff9500";
  if (risk >= 25) return "#ffcc00";
  return "#34c759";
}

function hexagonPath(r: number): string {
  const pts = d3.range(6).map((i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return [r * Math.cos(angle), r * Math.sin(angle)];
  });
  return `M${pts.map((p) => p.join(",")).join("L")}Z`;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  additive: Additive;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  interaction: Interaction;
}

export default function NetworkGraph({ additives, interactions }: { additives: Additive[]; interactions: Interaction[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 420;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (additives.length === 0) return;

    const nodes: GraphNode[] = additives.map((a) => ({ id: a.id, additive: a }));
    const links: GraphLink[] = interactions.map((i) => ({
      source: i.pair[0],
      target: i.pair[1],
      interaction: i,
    }));

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(150).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(54));

    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "addisafe-glow").attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
    glow.append("feGaussianBlur").attr("stdDeviation", 5).attr("result", "blur");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const link = svg.append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => SEVERITY_COLORS[d.interaction.severity])
      .attr("stroke-width", (d) => (d.interaction.severity === "DANGEROUS" ? 4 : 2.5))
      .attr("stroke-opacity", 0.8)
      .attr("stroke-dasharray", (d) => (d.interaction.severity === "DANGEROUS" ? null : "7 5"))
      .attr("filter", (d) => (d.interaction.severity === "DANGEROUS" ? "url(#addisafe-glow)" : null));

    const linkLabel = svg.append("g")
      .selectAll<SVGTextElement, GraphLink>("text")
      .data(links)
      .join("text")
      .text((d) => d.interaction.severity)
      .attr("font-size", 9)
      .attr("font-weight", 800)
      .attr("letter-spacing", "0.1em")
      .attr("text-anchor", "middle")
      .attr("fill", (d) => SEVERITY_COLORS[d.interaction.severity])
      .attr("paint-order", "stroke")
      .attr("stroke", "var(--background)")
      .attr("stroke-width", 4);

    const node = svg.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "grab")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    node.append("path")
      .attr("d", hexagonPath(30))
      .attr("fill", (d) => nodeColor(d.additive.riskIndex))
      .attr("fill-opacity", 0.18)
      .attr("stroke", (d) => nodeColor(d.additive.riskIndex))
      .attr("stroke-width", 2.5);

    node.append("text")
      .text((d) => d.additive.eCode ?? "—")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 11)
      .attr("font-weight", 800)
      .attr("fill", (d) => nodeColor(d.additive.riskIndex));

    node.append("text")
      .text((d) => d.additive.name)
      .attr("text-anchor", "middle")
      .attr("dy", 48)
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("fill", "var(--color-foreground, currentColor)")
      .attr("paint-order", "stroke")
      .attr("stroke", "var(--background)")
      .attr("stroke-width", 3);

    node.append("text")
      .text((d) => `Risk ${d.additive.riskIndex}`)
      .attr("text-anchor", "middle")
      .attr("dy", 60)
      .attr("font-size", 8.5)
      .attr("font-weight", 600)
      .attr("fill", "var(--color-muted-foreground, gray)")
      .attr("paint-order", "stroke")
      .attr("stroke", "var(--background)")
      .attr("stroke-width", 3);

    simulation.on("tick", () => {
      const pad = 50;
      nodes.forEach((d) => {
        d.x = Math.max(pad, Math.min(width - pad, d.x ?? 0));
        d.y = Math.max(pad, Math.min(height - pad, d.y ?? 0));
      });
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);
      linkLabel
        .attr("x", (d) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2)
        .attr("y", (d) => (((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2 - 6);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [additives, interactions]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[420px]">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
