import { type Claims, validateClaims } from "../config/claims.js";
import type { ResolvedConfig } from "../config/schema.js";
import type { Sidecar } from "../shared/sidecar.js";
import { type Finding, err, warn } from "./findings.js";

export function checkClaims(cfg: ResolvedConfig, claims: Claims, sidecars: Sidecar[]): Finding[] {
  const out = validateClaims(claims, cfg.locales.map((l) => l.code));
  const used = new Set<string>();
  for (const s of sidecars) {
    const where = { locale: s.locale, target: s.target, page: s.page };
    for (const t of s.texts) {
      if (t.claim) {
        used.add(t.claim);
        if (!claims[t.claim]) out.push(err("claims.unknown", `"${t.claim}" is not in claims.json`, where));
      } else if (!t.chrome && s.kit) {
        out.push(err("claims.untraced", `"${t.text.slice(0, 40)}" is visible text not taken from claims.json; use t() or t.el()`, where));
      }
    }
  }
  for (const id of Object.keys(claims)) if (!used.has(id)) out.push(warn("claims.unused", `"${id}" is not shown on any screen`));
  return out;
}
