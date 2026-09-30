import fs from "node:fs";
import path from "node:path";
import { APPLE_ONLY_FONT, type ResolvedConfig } from "../config/schema.js";
import { PLATFORMS, isAppleOnlyFontName } from "../config/targets.js";
import { outPath } from "../render/render.js";
import { type Sidecar, sidecarPath } from "../shared/sidecar.js";
import { type Finding, err, warn } from "./findings.js";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// What a sidecar lacks for the checks to read it, or null when it is complete.
function sidecarProblem(v: unknown): string | null {
  if (!isObject(v)) return "is not a JSON object";
  const arrays = ["texts", "fonts", "captures", "devices", "warnings", "generated", "claimsShown", "servedFonts"];
  const missing = arrays.filter((k) => !Array.isArray(v[k]));
  if (!isObject(v.requests) || !Array.isArray(v.requests.captures) || !Array.isArray(v.requests.fonts)) missing.push("requests");
  if (typeof v.kit !== "boolean") missing.push("kit");
  if (typeof v.changedAfterReady !== "boolean") missing.push("changedAfterReady");
  if (missing.length) return `lacks ${missing.join(", ")}`;
  const entries = [...(v.texts as unknown[]), ...(v.generated as unknown[]), ...(v.claimsShown as unknown[]), ...(v.servedFonts as unknown[])];
  return entries.every(isObject) ? null : "has entries that are not objects";
}

export function loadSidecars(cfg: ResolvedConfig): { sidecars: Sidecar[]; findings: Finding[] } {
  const sidecars: Sidecar[] = [], findings: Finding[] = [];
  for (const l of cfg.locales) for (const t of cfg.targets) for (const p of cfg.pages) {
    const where = { locale: l.code, target: t.name, page: p };
    const file = sidecarPath(outPath(cfg, l.code, t.name, p));
    if (!fs.existsSync(file)) { findings.push(err("render.missing", "not rendered; run shotsmith build", where)); continue; }
    const name = path.relative(cfg.root, file).split(path.sep).join("/");
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {
      findings.push(err("render.corrupt", `${name} cannot be read (${(e as Error).message}); run shotsmith build`, where));
      continue;
    }
    const problem = sidecarProblem(raw);
    if (problem) { findings.push(err("render.corrupt", `${name} ${problem}; run shotsmith build`, where)); continue; }
    // The file's place names the render it belongs to, whatever the JSON says.
    sidecars.push({ ...(raw as Sidecar), ...where });
  }
  return { sidecars, findings };
}

export function checkSidecars(cfg: ResolvedConfig, sidecars: Sidecar[]): Finding[] {
  const out: Finding[] = [];
  for (const s of sidecars) {
    const where = { locale: s.locale, target: s.target, page: s.page };
    const target = cfg.targets.find((t) => t.name === s.target);
    for (const t of s.texts) {
      const q = `"${t.text.slice(0, 40)}"`;
      if (t.overflow) out.push(err("text.overflow", `${q} does not fit its box`, where));
      if (t.clipped) out.push(err("text.clipped", `${q} runs off the image`, where));
      if (t.safeArea && !t.clipped) out.push(err("text.safeArea", `${q} is inside the top or bottom 4%`, where));
      if (!t.covered) {
        const missing = t.missingGlyphs ?? [];
        const why = [
          t.fallbackFonts.length ? `renders with system font(s) ${t.fallbackFonts.join(", ")}` : "",
          missing.length ? `has characters with no glyph in the configured font (${missing.slice(0, 8).join(" ")}${missing.length > 8 ? " ..." : ""})` : "",
        ].filter(Boolean).join(" and ");
        out.push(err("text.coverage", `${q} ${why || "is not covered"}; the configured font does not cover it`, where));
      }
      if (t.shrink !== null && t.shrink < 0.8) out.push(warn("text.shrink", `${q} shrank to ${Math.round(t.shrink * 100)}% of its size to fit`, where));
    }
    if (target?.store === "play") {
      // One finding per font, from whichever evidence names it: the kit's faces, the files served, the fonts text was drawn with.
      const apple = new Map<string, string>();
      for (const f of s.fonts) {
        const file = f.url.startsWith("/sysfont/") ? `sysfont:${f.url.slice("/sysfont/".length)}` : "";
        if (APPLE_ONLY_FONT.test(file)) apple.set(f.url, `${f.url} is licensed for Apple platforms only`);
      }
      const served = s.servedFonts.filter((f) => f.appleOnly);
      for (const f of served) if (!apple.has(f.url)) apple.set(f.url, `${f.url} is ${f.names.find(isAppleOnlyFontName)}, which is licensed for Apple platforms only`);
      const named = new Set(served.flatMap((f) => f.names));
      for (const t of s.texts) {
        const names = [...t.fallbackFonts, ...(t.usedFonts ?? [])];
        const n = names.find(isAppleOnlyFontName);
        if (n && !names.some((x) => named.has(x) || apple.has(x))) apple.set(n, `"${t.text.slice(0, 40)}" is drawn with ${n}, which is licensed for Apple platforms only`);
      }
      for (const m of apple.values()) out.push(err("font.appleOnly", m, where));
    }
    if (target) for (const c of s.requests.captures) {
      const platform = c.split("/")[2]?.toLowerCase() ?? "";
      if ((PLATFORMS as string[]).includes(platform) && platform !== target.platform) {
        out.push(err("capture.crossPlatform", `the page loaded ${c}, a ${platform} capture, on a ${target.platform} target; captures never come from another platform`, where));
      }
    }
    if (s.changedAfterReady) out.push(err("render.changedAfterReady", "the page's text changed after ready(); the checks ran on text that is not in the image", where));
    for (const w of s.warnings) {
      const i = w.indexOf(": ");
      const rule = i > 0 && /^[a-z][\w.]*$/i.test(w.slice(0, i)) ? w.slice(0, i) : "kit.warning";
      // A page that does not use the kit cannot be verified (text, claims, fonts), so it fails the checks.
      out.push((rule === "kit.unused" ? err : warn)(rule, i > 0 ? w.slice(i + 2) : w, where));
    }
  }
  return out;
}
