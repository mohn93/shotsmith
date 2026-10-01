import { type Claims, validateClaims } from "../config/claims.js";
import type { ResolvedConfig } from "../config/schema.js";
import type { Sidecar, SidecarGenerated } from "../shared/sidecar.js";
import { type Finding, err, warn } from "./findings.js";

// Line breaks and spacing are layout, not wording, so claims are compared with all whitespace removed.
const bare = (s: string) => s.replace(/\s+/g, "");
// Messages are one line: whitespace (newlines included) collapses to single spaces.
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const quote = (s: string) => { const t = oneLine(s); return `"${t.length > 60 ? `${t.slice(0, 60)}...` : t}"`; };

// Where s (one line) has passed n non-space characters.
function indexAfter(s: string, n: number): number {
  let i = 0;
  for (let seen = 0; i < s.length && seen < n; i++) if (!/\s/.test(s[i])) seen++;
  return i;
}

// Both texts, cut to the part around their first difference (whitespace ignored) when either is long.
function mismatchText(shown: string, claim: string, locale: string): string {
  const a = oneLine(shown), b = oneLine(claim);
  if (a.length <= 60 && b.length <= 60) return `shows "${a}" but its ${locale} text is "${b}"`;
  const x = bare(a), y = bare(b);
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  const around = (s: string) => {
    const i = indexAfter(s, n), from = Math.max(0, i - 20), to = Math.min(s.length, i + 40);
    return `"${from > 0 ? "..." : ""}${s.slice(from, to)}${to < s.length ? "..." : ""}"`;
  };
  return `shows ${around(a)} but its ${locale} text is ${around(b)} (they differ from character ${indexAfter(a, n) + 1})`;
}

// Punctuation and symbols alone (the quotes of <q>, bullets, check marks, arrows) are decoration, not claims.
const DECORATION = /^[\p{P}\p{S}\s]*$/u;
// A list marker drawn from a counter: a counter style keyword (decimal, lower-roman) or a counter() value.
const isCounter = (g: SidecarGenerated) => (g.kind === "marker" && /^[a-z][a-z-]*$/.test(g.text)) || /\bcounters?\(/.test(g.text);

const HOW: Record<SidecarGenerated["kind"], string> = {
  pseudo: "shown by a ::before or ::after content value",
  marker: "shown as a list marker",
  canvas: "drawn on a canvas",
  frame: "shown in a frame, which the checks cannot read",
  form: "shown by a form control",
  svgImage: "drawn by an SVG image",
  svgUnreadable: "an SVG image that could not be read",
  shadowClosed: "inside a closed shadow root, which the checks cannot read",
  alt: "shown as the alt text of an image that is not drawn",
};

export function checkClaims(cfg: ResolvedConfig, claims: Claims, sidecars: Sidecar[]): Finding[] {
  const out = validateClaims(claims, cfg.locales.map((l) => l.code));
  const used = new Set<string>();
  for (const s of sidecars) {
    const where = { locale: s.locale, target: s.target, page: s.page };
    const unknown = new Set<string>();
    const known = (id: string) => {
      used.add(id);
      if (claims[id]) return true;
      if (!unknown.has(id)) out.push(err("claims.unknown", `"${id}" is not in claims.json`, where));
      unknown.add(id);
      return false;
    };
    for (const t of s.texts) {
      if (t.claim) known(t.claim);
      else if (s.kit) {
        out.push(err("claims.untraced", `"${oneLine(t.text).slice(0, 40)}" is visible text outside a claim element; put it inside a claim element (t.el(), headline() or an element with data-claim)`, where));
      }
    }
    // data-claim alone proves nothing: each claim element must show exactly the claim's text for this locale.
    for (const c of s.claimsShown) {
      if (!known(c.claim)) continue;
      const text = claims[c.claim].text[s.locale] ?? "";
      if (bare(c.text) !== bare(text)) {
        out.push(err("claims.mismatch", `claim "${c.claim}" ${mismatchText(c.text, text, s.locale)}`, where));
      }
    }
    for (const g of s.generated) {
      if ((g.kind === "pseudo" || g.kind === "marker") && DECORATION.test(g.text)) continue;
      if (g.kind === "svgUnreadable") {
        out.push(err("claims.untraced", `could not read SVG image ${quote(g.text)} to check it for text; serve it from the workspace (pages/ or inputs/) or use a raster image`, where));
        continue;
      }
      const counter = isCounter(g) ? "; numbered lists must put their numbers in claim text (use list-style: none)" : "";
      out.push(err("claims.untraced", `${g.kind}: ${quote(g.text)} is ${HOW[g.kind] ?? "generated"}${counter}, not taken from claims.json; show the text as DOM text inside a claim element (t.el(), headline() or an element with data-claim)`, where));
    }
  }
  for (const id of Object.keys(claims)) if (!used.has(id)) out.push(warn("claims.unused", `"${id}" is not shown on any screen`));
  return out;
}
