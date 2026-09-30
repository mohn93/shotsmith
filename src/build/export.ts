import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Baseline, not progressive: App Store Connect left progressive uploads unprocessed.
// sharp's mozjpeg option forces progressive, so it is never used. 4:4:4 keeps small UI text sharp.
export async function encodeJpeg(png: string, out: string): Promise<void> {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(png).removeAlpha().jpeg({ quality: 92, chromaSubsampling: "4:4:4", progressive: false, optimiseCoding: true }).toFile(out);
}

export async function contactSheet(pngs: string[], out: string): Promise<void> {
  const tiles = await Promise.all(pngs.map((p) => sharp(p).resize({ height: 800 }).toBuffer({ resolveWithObject: true })));
  const tw = tiles[0]?.info.width ?? 0;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({ create: { width: 24 + tiles.length * (tw + 24), height: 848, channels: 3, background: "#808080" } })
    .composite(tiles.map((t, i) => ({ input: t.data, left: 24 + i * (tw + 24), top: 24 })))
    .jpeg({ quality: 88 })
    .toFile(out);
}
