import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { checkSidecars } from "../src/checks/sidecars.js";
import { exportPath } from "../src/checks/store.js";
import { loadConfig } from "../src/config/schema.js";
import { openGlyphSources } from "../src/render/fonts.js";
import { outPath } from "../src/render/render.js";
import { strip } from "../src/review/strip.js";
import { thumbs } from "../src/review/thumbs.js";
import { emptySidecar } from "../src/shared/sidecar.js";
import { ROOT, tempDir } from "./helpers.js";

function ws(): string {
  const dir = tempDir("fu-");
  fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify({ app: "A", pages: ["a", "b"], targets: ["android-phone"], locales: [{ code: "en" }] }));
  return dir;
}
const png = async (file: string, w: number, h: number) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({ create: { width: w, height: h, channels: 3, background: "#456" } }).png().toFile(file);
};

describe("unreadable fonts", () => {
  it("reports a font file fontkit cannot open, once", () => {
    const dir = tempDir("fu-");
    const bad = path.join(dir, "Broken.ttf");
    fs.writeFileSync(bad, "not a font");
    const errors: string[] = [];
    const cache = new Map();
    expect(openGlyphSources(bad, cache, (f) => errors.push(f))).toEqual([]);
    expect(openGlyphSources(bad, cache, (f) => errors.push(f))).toEqual([]);
    expect(errors).toEqual([bad]);
  });

  it("turns font.unreadable into an error finding", () => {
    const cfg = loadConfig(ws());
    const f = checkSidecars(cfg, [emptySidecar("a", "android-phone", "en", "font.unreadable: fonts/Broken.ttf could not be read (bad), so its glyph coverage was not checked")]);
    expect(f).toEqual([expect.objectContaining({ rule: "font.unreadable", severity: "error", page: "a" })]);
  });
});

describe("review files", () => {
  it("keeps thumbs from out and from export apart", async () => {
    const dir = ws();
    const cfg = loadConfig(dir);
    for (const p of ["a", "b"]) {
      await png(outPath(cfg, "en", "android-phone", p), 1080, 1920);
      const e = exportPath(cfg, "en", "android-phone", p);
      fs.mkdirSync(path.dirname(e), { recursive: true });
      await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#456" } }).jpeg().toFile(e);
    }
    const a = await thumbs(cfg, { target: "android-phone" });
    const b = await thumbs(cfg, { target: "android-phone", from: "export" });
    expect(path.basename(a)).toBe("en-android-phone-300.png");
    expect(path.basename(b)).toBe("en-android-phone-300-export.png");
  });

  it("refuses to join renders of the wrong size", async () => {
    const dir = ws();
    const cfg = loadConfig(dir);
    await png(outPath(cfg, "en", "android-phone", "a"), 1080, 1920);
    await png(outPath(cfg, "en", "android-phone", "b"), 1080, 1900);
    await expect(strip(cfg, { target: "android-phone" })).rejects.toThrow(/b\.png is 1080x1900, expected 1080x1920; run shotsmith build/);
  });
});

describe("init next steps", () => {
  it("says to cd into the new folder and to npm install after --no-install", () => {
    const rel = `test/.tmp/init-next-${process.pid}`;
    fs.rmSync(path.join(ROOT, rel), { recursive: true, force: true });
    const r = spawnSync("node", ["dist/cli.js", "init", rel, "--no-install"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`  cd ${rel}\n`);
    expect(r.stdout).toContain("  npm install\n");
    expect(r.stdout).toContain("  npx shotsmith build\n");
  });
});
