import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function capture(file: string, w: number, h: number): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const card = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="120" fill="#20242c"/>
    <rect x="90" y="600" width="${Math.min(990, w - 180)}" height="300" rx="40" fill="#e0402a"/>
    <rect x="0" y="${h - 200}" width="${w}" height="200" fill="#ffffff"/></svg>`);
  await sharp({ create: { width: w, height: h, channels: 3, background: "#f4efe6" } }).composite([{ input: card }]).png().toFile(file);
}

export async function makeCaptures(ws: string): Promise<void> {
  await capture(path.join(ws, "inputs/iphone/en/home.png"), 1170, 2532);
  await capture(path.join(ws, "inputs/android-phone/en/home.png"), 1080, 2400);
  await capture(path.join(ws, "inputs/ipad/en/home.png"), 2048, 2732);
  await capture(path.join(ws, "inputs/android-tablet/en/home.png"), 1600, 2560);
}
