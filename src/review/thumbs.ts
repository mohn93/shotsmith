import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { exportPath, refuseLinked } from "../checks/store.js";
import type { ResolvedConfig } from "../config/schema.js";
import { outPath } from "../render/render.js";

// One row of every screen at a fixed width, the way a store listing shows them. 300 for the whole-set
// review, 700 for per-screen critique (700 px wide, not tall).
export async function thumbs(cfg: ResolvedConfig, o: { target: string; locale?: string; width?: number; from?: "out" | "export" }): Promise<string> {
  const locale = o.locale ?? cfg.defaultLocale, width = o.width ?? 300, gap = Math.round(width / 15);
  const files = cfg.pages.map((p) => (o.from === "export" ? exportPath(cfg, locale, o.target, p) : outPath(cfg, locale, o.target, p))).filter((f) => fs.existsSync(f));
  if (!files.length) throw new Error(`Nothing rendered for ${locale}/${o.target}; run shotsmith build`);
  const tiles = await Promise.all(files.map((f) => sharp(f).resize({ width }).toBuffer({ resolveWithObject: true })));
  const h = tiles[0].info.height;
  const out = path.join(cfg.root, "review", `${locale}-${o.target}-${width}.png`);
  refuseLinked(cfg.root, out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({ create: { width: gap + tiles.length * (width + gap), height: h + 2 * gap, channels: 3, background: "#ffffff" } })
    .composite(tiles.map((t, i) => ({ input: t.data, left: gap + i * (width + gap), top: gap }))).png().toFile(out);
  return out;
}
