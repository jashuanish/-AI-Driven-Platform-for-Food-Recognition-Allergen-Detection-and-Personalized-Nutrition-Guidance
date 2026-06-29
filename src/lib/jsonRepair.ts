// Tolerant JSON extraction for LLM output. Vision models frequently wrap
// JSON in markdown fences, add prose around it, emit trailing commas, or
// get truncated mid-object — all of which break a naive JSON.parse.

export function parseModelJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  let text = raw.trim().replace(/```(?:json)?/gi, "");

  const start = text.indexOf("{");
  if (start === -1) return null;
  const end = text.lastIndexOf("}");
  const candidate = end > start ? text.slice(start, end + 1) : text.slice(start);

  for (const attempt of [candidate, repair(candidate)]) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}

function repair(s: string): string {
  const out = s
    .replace(/[“”]/g, '"')   // smart double quotes
    .replace(/[‘’]/g, "'")   // smart single quotes
    // schema-echo unions: `"Easy" | "Moderate" | "Lifestyle change"` → keep first option
    .replace(/("(?:[^"\\]|\\.)*")(\s*\|\s*"(?:[^"\\]|\\.)*")+/g, "$1")
    .replace(/,\s*([}\]])/g, "$1");    // trailing commas
  return closeTruncated(out);
}

// Weak models sometimes parrot the prompt's example schema back verbatim
// instead of analyzing the actual product. Detect the telltale placeholders.
const SCHEMA_PLACEHOLDERS = [
  "Product Name", "Brand Name", "Variant/Flavour", "Ingredient name",
  "Nutrient Name", "Name of allergen", "User profile description here",
];

export function looksLikeSchemaEcho(parsed: any): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const probes = [
    parsed?.snapshot?.name, parsed?.snapshot?.brand, parsed?.snapshot?.variant,
    parsed?.ingredients?.[0]?.name, parsed?.nutrition?.[0]?.nutrient,
    parsed?.allergySafety?.profile,
  ];
  return probes.filter((v) => typeof v === "string" && SCHEMA_PLACEHOLDERS.includes(v)).length >= 2;
}

// Balance quotes/braces/brackets so a response cut off mid-stream still parses.
function closeTruncated(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack[stack.length - 1] === ch) stack.pop();
    }
  }
  let out = s;
  if (inStr) out += '"';
  out = out.replace(/[,:]\s*$/, "");
  while (stack.length) out += stack.pop();
  return out.replace(/,\s*([}\]])/g, "$1");
}
