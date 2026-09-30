import fs from "node:fs";
import { APPLE_ONLY_FONT, type ResolvedConfig } from "../config/schema.js";
import { outPath } from "../render/render.js";
import type { Sidecar } from "../shared/sidecar.js";
import { type Finding, err, warn } from "./findings.js";

export function loadSidecars(cfg: ResolvedConfig): { sidecars: Sidecar[]; findings: Finding[] } {
  const sidecars: Sidecar[] = [], findings: Finding[] = [];
  for (const l of cfg.locales) for (const t of cfg.targets) for (const p of cfg.pages) {
    const file = outPath(cfg, l.code, t.name, p).replace(/\.png$/, ".json");
    if (!fs.existsSync(file)) findings.push(err("render.missing", "not rendered; run shotsmith build", { locale: l.code, target: t.name, page: p }));
    else sidecars.push(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  return { sidecars, findings };
}

export function checkSidecars(cfg: ResolvedConfig, sidecars: Sidecar[]): Finding[] {
  const out: Finding[] = [];
  for (const s of sidecars) {
    const where = { locale: s.locale, target: s.target, page: s.page };
    const store = cfg.targets.find((t) => t.name === s.target)?.store;
    for (const t of s.texts) {
      const q = `"${t.text.slice(0, 40)}"`;
      if (t.overflow) out.push(err("text.overflow", `${q} does not fit its box`, where));
      if (t.clipped) out.push(err("text.clipped", `${q} runs off the image`, where));
      if (t.safeArea && !t.clipped) out.push(err("text.safeArea", `${q} is inside the top or bottom 4%`, where));
      if (!t.covered) out.push(err("text.coverage", `${q} renders with system font(s) ${t.fallbackFonts.join(", ")}; the configured font does not cover it`, where));
      if (t.shrink !== null && t.shrink < 0.8) out.push(warn("text.shrink", `${q} shrank to ${Math.round(t.shrink * 100)}% of its size to fit`, where));
    }
    if (store === "play") for (const f of s.fonts) {
      const file = f.url.startsWith("/sysfont/") ? `sysfont:${f.url.slice("/sysfont/".length)}` : "";
      if (APPLE_ONLY_FONT.test(file)) out.push(err("font.appleOnly", `${f.url} is licensed for Apple platforms only`, where));
    }
    for (const w of s.warnings) {
      const i = w.indexOf(": ");
      const rule = i > 0 && /^[a-z][\w.]*$/i.test(w.slice(0, i)) ? w.slice(0, i) : "kit.warning";
      out.push(warn(rule, i > 0 ? w.slice(i + 2) : w, where));
    }
  }
  return out;
}
