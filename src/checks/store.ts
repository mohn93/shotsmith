import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ResolvedConfig } from "../config/schema.js";
import { type Finding, err } from "./findings.js";

export const exportPath = (cfg: ResolvedConfig, locale: string, target: string, page: string, ext = "jpg"): string =>
  path.join(cfg.root, cfg.output, locale, target, `${page}.${ext}`);

export async function checkExports(cfg: ResolvedConfig): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const t of cfg.targets) {
    const play = t.store === "play";
    const limit = play ? 8 : 10;
    if (cfg.pages.length > limit) out.push(err("store.count", `${cfg.pages.length} screens; the ${play ? "Google Play" : "App Store"} limit is ${limit}`, { target: t.name }));
    if (Math.min(t.w, t.h) < 320 || Math.max(t.w, t.h) > 3840) out.push(err("store.sides", "each side must be 320 to 3840 px", { target: t.name }));
    if (play && Math.max(t.w, t.h) / Math.min(t.w, t.h) > 2) out.push(err("store.aspect", "aspect ratio over 2:1; Google Play rejects it", { target: t.name }));
    for (const l of cfg.locales) {
      const dir = path.dirname(exportPath(cfg, l.code, t.name, "x"));
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)) : [];
      for (const f of files) if (!cfg.pages.includes(f.replace(/\.[^.]+$/, ""))) out.push(err("store.stale", `${f} is not a configured page`, { locale: l.code, target: t.name }));
      for (const page of cfg.pages) {
        const where = { locale: l.code, target: t.name, page };
        const file = files.find((f) => f.replace(/\.[^.]+$/, "") === page);
        if (!file) { out.push(err("store.missing", "no exported image", where)); continue; }
        const m = await sharp(path.join(dir, file)).metadata();
        if (m.width !== t.w || m.height !== t.h) out.push(err("store.size", `${m.width}x${m.height}, expected ${t.w}x${t.h}`, where));
        if (m.hasAlpha || m.channels !== 3) out.push(err("store.alpha", `${m.channels} channels; stores need opaque RGB`, where));
        if (m.format === "jpeg") {
          if (m.isProgressive) out.push(err("store.progressive", "progressive JPEG; App Store Connect leaves these unprocessed", where));
          if (m.chromaSubsampling !== "4:4:4") out.push(err("store.chroma", `chroma ${m.chromaSubsampling}, expected 4:4:4`, where));
        } else if (m.format !== "png") out.push(err("store.format", `${m.format}; use JPEG or PNG`, where));
      }
    }
  }
  return out;
}
