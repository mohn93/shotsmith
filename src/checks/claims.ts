import { type Claims, validateClaims } from "../config/claims.js";
import type { ResolvedConfig } from "../config/schema.js";
import type { Sidecar, SidecarGenerated } from "../shared/sidecar.js";
import { type Finding, err, warn } from "./findings.js";

// Line breaks and spacing are layout, not wording, so claims are compared with all whitespace removed.
const bare = (s: string) => s.replace(/\s+/g, "");
const quote = (s: string) => `"${s.length > 60 ? `${s.slice(0, 60)}...` : s}"`;

// Quotation marks and other punctuation alone (the quotes of <q>, a bullet) carry no claim.
const PUNCTUATION_ONLY = /^[\p{P}\s]*$/u;

const HOW: Record<SidecarGenerated["kind"], string> = {
  pseudo: "shown by a ::before or ::after content value",
  marker: "shown as a list marker; numbered lists must put their numbers in claim text (use list-style: none)",
  canvas: "drawn on a canvas",
  frame: "shown in a frame, which the checks cannot read",
  form: "shown by a form control",
  svgImage: "drawn by an SVG image",
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
      else if (!t.chrome && s.kit) {
        out.push(err("claims.untraced", `"${t.text.slice(0, 40)}" is visible text not taken from claims.json; use t() or t.el()`, where));
      }
    }
    // data-claim alone proves nothing: each claim element must show exactly the claim's text for this locale.
    for (const c of s.claimsShown) {
      if (!known(c.claim)) continue;
      const text = claims[c.claim].text[s.locale] ?? "";
      if (bare(c.text) !== bare(text)) {
        out.push(err("claims.mismatch", `claim "${c.claim}" shows ${quote(c.text)} but its ${s.locale} text is ${quote(text)}`, where));
      }
    }
    for (const g of s.generated) {
      if (g.chrome || (g.kind === "pseudo" && PUNCTUATION_ONLY.test(g.text))) continue;
      const counter = g.kind === "pseudo" && /\bcounters?\(/.test(g.text) ? "; numbered lists must put their numbers in claim text" : "";
      out.push(err("claims.untraced", `${g.kind}: ${quote(g.text)} is ${HOW[g.kind] ?? "generated"}${counter}, not taken from claims.json; show claims with t() or t.el()`, where));
    }
  }
  for (const id of Object.keys(claims)) if (!used.has(id)) out.push(warn("claims.unused", `"${id}" is not shown on any screen`));
  return out;
}
