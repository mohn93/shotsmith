import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/schema.js";
import { outPath } from "../src/render/render.js";
import { seamSteps, strip } from "../src/review/strip.js";
import { thumbs } from "../src/review/thumbs.js";

const solid = (w: number, h: number, v: number) => Buffer.alloc(w * h * 3, v);
const gradient = (w: number, h: number, x0: number) => {
  const b = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.fill(Math.round(((x0 + x) / (w * 2)) * 255), (y * w + x) * 3, (y * w + x) * 3 + 3);
  return b;
};

describe("review", () => {
  it("finds seam steps but not smooth joins", () => {
    expect(seamSteps(gradient(64, 64, 0), gradient(64, 64, 64), 64, 64)).toEqual([]);
    expect(seamSteps(solid(64, 64, 20), solid(64, 64, 200), 64, 64)[0]).toMatchObject({ from: 0, to: 64, max: 180 });
  });

  it("writes thumbnail rows and strips", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rev-"));
    fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify({ app: "A", pages: ["a", "b"], targets: ["android-phone"], locales: [{ code: "en" }] }));
    const cfg = loadConfig(dir);
    for (const [p, v] of [["a", 40], ["b", 40]] as const) {
      const f = outPath(cfg, "en", "android-phone", p);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      await sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: v, g: v, b: v } } }).png().toFile(f);
    }
    const t = await thumbs(cfg, { target: "android-phone" });
    expect((await sharp(t).metadata()).width).toBe(20 + 2 * (300 + 20));
    const s = await strip(cfg, { target: "android-phone" });
    expect(s.seams[0].steps).toEqual([]);
    expect((await sharp(s.file).metadata()).width).toBe(2160);
  });
});
