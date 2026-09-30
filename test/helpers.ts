import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "../src/config/schema.js";
import { openRenderer, type Renderer } from "../src/render/render.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Copies a fixture workspace into test/.tmp and links the repo's node_modules (three, gsap) into it.
export function tmpWorkspace(fixture: string): string {
  const dir = path.join(ROOT, "test/.tmp", `${fixture}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  fs.cpSync(path.join(ROOT, "test/fixtures", fixture), dir, { recursive: true });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}

export async function withRenderer<T>(ws: string, fn: (r: Renderer) => Promise<T>): Promise<T> {
  const r = await openRenderer(loadConfig(ws));
  try { return await fn(r); } finally { await r.close(); }
}

export async function pixel(file: string, x: number, y: number): Promise<[number, number, number]> {
  const { data } = await sharp(file).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

// Compares a render with a committed baseline for this OS. A missing baseline is written and the test fails,
// so a person reviews it before committing. Tolerance: mean channel difference below 2 and under 0.5% of
// pixels differing by more than 32.
export async function compareBaseline(file: string, name: string): Promise<void> {
  const dir = path.join(ROOT, "test/baselines", process.platform === "darwin" ? "darwin" : "linux");
  const base = path.join(dir, `${name}.png`);
  if (!fs.existsSync(base)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, base);
    throw new Error(`Baseline created at ${base}; review it and commit it`);
  }
  const [a, b] = await Promise.all([file, base].map((f) => sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error(`${name}: size differs from baseline`);
  let sum = 0, big = 0;
  for (let i = 0; i < a.data.length; i++) { const d = Math.abs(a.data[i] - b.data[i]); sum += d; if (d > 32) big++; }
  const mean = sum / a.data.length, share = big / a.data.length;
  if (mean >= 2 || share >= 0.005) throw new Error(`${name}: differs from baseline (mean ${mean.toFixed(2)}, ${(share * 100).toFixed(2)}% changed)`);
}
