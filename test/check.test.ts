import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/schema.js";
import { checkInputs } from "../src/checks/inputs.js";
import { checkSidecars, loadSidecars } from "../src/checks/sidecars.js";
import { checkExports, exportPath } from "../src/checks/store.js";
import type { Sidecar } from "../src/shared/sidecar.js";

function ws(targets: unknown[], pages = ["a", "b"]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-"));
  fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify({ app: "A", pages, targets, locales: [{ code: "en" }] }));
  return dir;
}
const rules = (f: { rule: string }[]) => f.map((x) => x.rule).sort();

describe("checks", () => {
  it("requires captures per platform", () => {
    const dir = ws(["iphone-6.9", "android-phone"]);
    fs.mkdirSync(path.join(dir, "inputs/iphone/en"), { recursive: true });
    fs.writeFileSync(path.join(dir, "inputs/iphone/en/home.png"), "x");
    expect(checkInputs(loadConfig(dir)).map((f) => f.message)).toEqual([expect.stringMatching(/android-phone/)]);
  });

  it("finds bad exports", async () => {
    const dir = ws(["iphone-6.9", { name: "tall-play", w: 1080, h: 2400, platform: "android-phone" }]);
    const cfg = loadConfig(dir);
    const file = (t: string, p: string, ext = "jpg") => { const f = exportPath(cfg, "en", t, p, ext); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };
    await sharp({ create: { width: 1290, height: 2796, channels: 3, background: "#336" } }).jpeg({ progressive: true }).toFile(file("iphone-6.9", "a"));
    await sharp({ create: { width: 1290, height: 2790, channels: 4, background: "#3366" } }).png().toFile(file("iphone-6.9", "b", "png"));
    await sharp({ create: { width: 1290, height: 2796, channels: 3, background: "#336" } }).jpeg().toFile(file("iphone-6.9", "old"));
    await sharp({ create: { width: 1080, height: 2400, channels: 3, background: "#336" } }).jpeg({ chromaSubsampling: "4:4:4" }).toFile(file("tall-play", "a"));
    expect(rules(await checkExports(cfg))).toEqual(["store.alpha", "store.aspect", "store.chroma", "store.missing", "store.progressive", "store.size", "store.stale"]);
  });

  it("turns sidecars into findings", () => {
    const dir = ws(["android-phone"], ["a"]);
    const cfg = loadConfig(dir);
    const text = { el: 0, claim: "h", chrome: false, text: "Hi", box: [0, 0, 10, 10] as [number, number, number, number], font: "x", overflow: true, clipped: false, safeArea: true, shrink: 0.7, covered: false, fallbackFonts: ["Geeza Pro"] };
    const sc: Sidecar = { page: "a", target: "android-phone", locale: "en", kit: true, texts: [text], captures: [], devices: [], lifts: 0,
      fonts: [{ family: "Shotsmith display", weight: "700", url: "/sysfont/SF-Pro-Display-Bold.otf", status: "loaded" }], warnings: ["capture.fallback: x"] };
    const f = checkSidecars(cfg, [sc]);
    expect(rules(f)).toEqual(["capture.fallback", "font.appleOnly", "text.coverage", "text.overflow", "text.safeArea", "text.shrink"]);
    expect(f.find((x) => x.rule === "text.shrink")!.severity).toBe("warning");
    expect(loadSidecars(cfg).findings.map((x) => x.rule)).toEqual(["render.missing"]);
  });

  it("reports characters the configured font has no glyph for", () => {
    const cfg = loadConfig(ws(["android-phone"], ["a"]));
    const text = { el: 0, claim: "h", chrome: false, text: "Tap \uE001", box: [0, 0, 10, 10] as [number, number, number, number], font: "x", overflow: false, clipped: false, safeArea: false, shrink: null, covered: false, fallbackFonts: [], missingGlyphs: ["U+E001"] };
    const sc: Sidecar = { page: "a", target: "android-phone", locale: "en", kit: true, texts: [text], captures: [], devices: [], lifts: 0, fonts: [], warnings: [] };
    const f = checkSidecars(cfg, [sc]);
    expect(f).toEqual([expect.objectContaining({ rule: "text.coverage", severity: "error", message: expect.stringContaining("U+E001") })]);
  });
});
