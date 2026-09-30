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
