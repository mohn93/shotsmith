import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/schema.js";
import { buildContext } from "../src/render/context.js";
import { findSysFont } from "../src/render/fonts.js";

function ws(config: object, files: string[] = []): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-"));
  fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify(config));
  for (const f of files) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), "x"); }
  return dir;
}
const base = {
  app: "A", pages: ["p"], targets: ["iphone-6.9", "android-phone"],
  locales: [{ code: "en" }, { code: "de" }],
  fonts: { display: { apple: "sysfont:SF-Pro-Display-Bold.otf", play: "fonts/Inter-Bold.ttf", fallback: "fonts/Inter-Bold.ttf" } },
  captures: { iphone: { statusBar: "included" } },
};
const files = ["fonts/Inter-Bold.ttf", "inputs/iphone/en/home.png", "inputs/iphone/en/map.png", "inputs/iphone/de/home.png", "inputs/android-phone/home.png"];
const claims = { h: { source: "s", text: { en: "Hello", de: "Hallo" } } };

afterEach(() => { delete process.env.FONT_DIRS; });

describe("buildContext", () => {
  it("uses the sysfont when installed", () => {
    const fontDir = fs.mkdtempSync(path.join(os.tmpdir(), "fonts-"));
    fs.writeFileSync(path.join(fontDir, "SF-Pro-Display-Bold.otf"), "x");
    process.env.FONT_DIRS = fontDir;
    expect(findSysFont("SF-Pro-Display-Bold.otf")).toBe(path.join(fontDir, "SF-Pro-Display-Bold.otf"));
    expect(findSysFont("../etc/passwd")).toBeNull();
    const ctx = buildContext(loadConfig(ws(base, files)), claims, "iphone-6.9", "de", "p");
    expect(ctx.fonts.display).toEqual({ family: "Shotsmith display", faces: [{ weight: "100 900", url: "/sysfont/SF-Pro-Display-Bold.otf" }] });
    expect(ctx.warnings).toEqual([]);
  });

  it("falls back with a warning when the sysfont is missing", () => {
    process.env.FONT_DIRS = fs.mkdtempSync(path.join(os.tmpdir(), "nofonts-"));
    const ctx = buildContext(loadConfig(ws(base, files)), claims, "iphone-6.9", "en", "p");
    expect(ctx.fonts.display.faces[0].url).toBe("/fonts/Inter-Bold.ttf");
    expect(ctx.warnings[0]).toMatch(/^font\.fallback: /);
  });

  it("resolves captures per platform and locale", () => {
    const ctx = buildContext(loadConfig(ws(base, files)), claims, "iphone-6.9", "de", "p");
    expect(ctx.captures.files.home).toEqual({ url: "/inputs/iphone/de/home.png", fallback: false });
    expect(ctx.captures.files.map).toEqual({ url: "/inputs/iphone/en/map.png", fallback: true });
    expect(ctx.captures.statusBar).toBe("included");
    const android = buildContext(loadConfig(ws(base, files)), claims, "android-phone", "de", "p");
    expect(android.captures.files.home).toEqual({ url: "/inputs/android-phone/home.png", fallback: false });
    expect(android.captures.statusBar).toBe("none");
    expect(android.fonts.display.faces[0].url).toBe("/fonts/Inter-Bold.ttf");
    expect(android.claims).toEqual({ h: "Hallo" });
  });

  it("defaults target and locale, and rejects unknown ones", () => {
    const cfg = loadConfig(ws(base, files));
    expect(buildContext(cfg, claims, "", "", "p").target.name).toBe("iphone-6.9");
    expect(() => buildContext(cfg, claims, "ipad-13", "en", "p")).toThrow(/ipad-13/);
    expect(() => buildContext(cfg, claims, "iphone-6.9", "fr", "p")).toThrow(/fr/);
  });
});
