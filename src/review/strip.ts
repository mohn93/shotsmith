import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ResolvedConfig } from "../config/schema.js";
import { outPath } from "../render/render.js";

const BAND = 16;
const lum = (b: Buffer, w: number, x: number, y: number) => { const i = (y * w + x) * 3; return b[i] * 0.2126 + b[i + 1] * 0.7152 + b[i + 2] * 0.0722; };

export function seamSteps(left: Buffer, right: Buffer, w: number, h: number): { from: number; to: number; max: number }[] {
  const ranges: { from: number; to: number; max: number }[] = [];
  for (let y0 = 0; y0 < h; y0 += BAND) {
    let step = 0, local = 0, n = 0;
    for (let y = y0; y < Math.min(h, y0 + BAND); y++, n++) {
      step += Math.abs(lum(left, w, w - 1, y) - lum(right, w, 0, y));
      local += Math.abs(lum(left, w, w - 2, y) - lum(left, w, w - 1, y));
    }
    step /= n; local /= n;
    if (step > 12 && step > 3 * Math.max(local, 1)) {
      const to = Math.min(h, y0 + BAND), last = ranges.at(-1), v = Math.round(step);
      if (last && y0 - last.to <= BAND) { last.to = to; last.max = Math.max(last.max, v); } else ranges.push({ from: y0, to, max: v });
    }
  }
  return ranges;
}

export async function strip(cfg: ResolvedConfig, o: { target: string; locale?: string }) {
  const locale = o.locale ?? cfg.defaultLocale;
  const t = cfg.targets.find((x) => x.name === o.target);
  if (!t) throw new Error(`Unknown target "${o.target}"`);
  const files = cfg.pages.map((p) => outPath(cfg, locale, t.name, p));
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`Missing ${f}; run shotsmith build`);
  const raws = await Promise.all(files.map((f) => sharp(f).removeAlpha().raw().toBuffer()));
  const seams = raws.slice(0, -1).map((b, i) => ({ between: [cfg.pages[i], cfg.pages[i + 1]] as [string, string], steps: seamSteps(b, raws[i + 1], t.w, t.h) }));
  const file = path.join(cfg.root, "review", `strip-${locale}-${t.name}.jpg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({ create: { width: t.w * files.length, height: t.h, channels: 3, background: "#000" } })
    .composite(files.map((input, i) => ({ input, left: i * t.w, top: 0 }))).jpeg({ quality: 90 }).toFile(file);
  const preview = file.replace(/\.jpg$/, "-preview.jpg");
  await sharp(file).resize({ width: 2400 }).jpeg({ quality: 88 }).toFile(preview);
  return { file, preview, seams };
}
