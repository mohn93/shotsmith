import fs from "node:fs";
import path from "node:path";
import { type Claims, claimsForLocale } from "../config/claims.js";
import type { FontSource, ResolvedConfig } from "../config/schema.js";
import type { FontFaceSpec, KitContext } from "../shared/context.js";
import { findSysFont } from "./fonts.js";

const IMAGE = /\.(png|jpe?g|webp)$/i;

function faces(root: string, src: FontSource): { faces: FontFaceSpec[]; missing: string[] } {
  const entries = typeof src === "string" ? [["100 900", src]] : Object.entries(src);
  const out: FontFaceSpec[] = [];
  const missing: string[] = [];
  for (const [weight, s] of entries) {
    if (s.startsWith("sysfont:")) {
      const file = s.slice("sysfont:".length);
      if (findSysFont(file)) out.push({ weight, url: `/sysfont/${file}` }); else missing.push(file);
    } else {
      if (!fs.existsSync(path.join(root, s))) throw new Error(`Font file not found: ${s}`);
      out.push({ weight, url: "/" + s.split(path.sep).join("/").replace(/^\.?\//, "") });
    }
  }
  return { faces: out, missing };
}

function listImages(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => IMAGE.test(f) && fs.statSync(path.join(dir, f)).isFile()) : [];
}

export function buildContext(cfg: ResolvedConfig, claims: Claims, targetName: string, localeCode: string, page: string): KitContext {
  const target = targetName ? cfg.targets.find((t) => t.name === targetName) : cfg.targets[0];
  if (!target) throw new Error(`Unknown target "${targetName}"; configured: ${cfg.targets.map((t) => t.name).join(", ")}`);
  const locale = localeCode ? cfg.locales.find((l) => l.code === localeCode) : cfg.locales[0];
  if (!locale) throw new Error(`Unknown locale "${localeCode}"; configured: ${cfg.locales.map((l) => l.code).join(", ")}`);
  const warnings: string[] = [];

  const fonts: KitContext["fonts"] = {};
  const roles = new Set([...Object.keys(cfg.fonts), ...Object.keys(locale.fonts)]);
  for (const role of roles) {
    const r = cfg.fonts[role] ?? {};
    const chosen = locale.fonts[role] ?? r[target.store] ?? r.fallback;
    if (!chosen) continue;
    let resolved = faces(cfg.root, chosen);
    if (resolved.missing.length) {
      if (!r.fallback) throw new Error(`Font ${resolved.missing.join(", ")} is not installed and fonts.${role}.fallback is not set`);
      const fb = faces(cfg.root, r.fallback);
      warnings.push(`font.fallback: ${resolved.missing.join(", ")} is not installed; using ${typeof r.fallback === "string" ? r.fallback : "the fallback set"}`);
      resolved = fb;
    }
    fonts[role] = { family: `Shotsmith ${role}`, faces: resolved.faces };
  }

  const base = path.join(cfg.root, "inputs", target.platform);
  const files: KitContext["captures"]["files"] = {};
  const add = (dir: string, fallback: boolean) => {
    for (const f of listImages(dir)) {
      const name = f.replace(IMAGE, "");
      if (!files[name]) files[name] = { url: "/" + path.relative(cfg.root, path.join(dir, f)).split(path.sep).join("/"), fallback };
    }
  };
  add(path.join(base, locale.code), false);
  if (locale.code !== cfg.defaultLocale) add(path.join(base, cfg.defaultLocale), true);
  add(base, false);

  const cap = cfg.captures[target.platform] ?? { statusBar: "none" as const };
  return {
    page,
    target,
    locale: { code: locale.code, dir: locale.dir, apple: locale.apple, play: locale.play },
    defaultLocale: cfg.defaultLocale,
    fonts,
    captures: { statusBar: cap.statusBar, pointWidth: cap.pointWidth ?? null, files },
    claims: claimsForLocale(claims, locale.code),
    warnings,
  };
}
