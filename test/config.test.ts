import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/schema.js";
import { APPLE_SIZES, isAcceptedAppleSize, isAppleOnlyFontName } from "../src/config/targets.js";
import { tempDir } from "./helpers.js";

function ws(config: unknown): string {
  const dir = tempDir("shotsmith-config-");
  fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify(config));
  return dir;
}
const base = { app: "Savory", pages: ["01-opener"], targets: ["iphone-6.9"], locales: [{ code: "en" }] };

describe("loadConfig", () => {
  it("resolves built-in targets and defaults", () => {
    const cfg = loadConfig(ws(base));
    expect(cfg.targets[0]).toEqual({ name: "iphone-6.9", w: 1290, h: 2796, platform: "iphone", store: "apple", formFactor: "tall" });
    expect(cfg.defaultLocale).toBe("en");
    expect(cfg.locales[0].dir).toBe("ltr");
    expect(cfg.output).toBe("export");
  });

  it("accepts a custom target", () => {
    const cfg = loadConfig(ws({ ...base, targets: [{ name: "pixel", w: 1080, h: 2160, platform: "android-phone" }] }));
    expect(cfg.targets[0]).toMatchObject({ name: "pixel", store: "play", formFactor: "p916" });
  });

  it("rejects locale codes that are not plain folder names", () => {
    for (const code of ["../x", "en/US", "a.b", ".."]) expect(() => loadConfig(ws({ ...base, locales: [{ code }] })), code).toThrow(/locales\.0\.code/);
    expect(loadConfig(ws({ ...base, locales: [{ code: "pt-BR" }, { code: "zh_Hant" }] })).locales.map((l) => l.code)).toEqual(["pt-BR", "zh_Hant"]);
  });

  it("rejects unknown targets with the list of built-ins", () => {
    expect(() => loadConfig(ws({ ...base, targets: ["iphone-99"] }))).toThrow(/iphone-99.*iphone-6\.9/s);
  });

  it("rejects SF fonts for Play targets", () => {
    const cfg = { ...base, targets: ["android-phone"], fonts: { display: { play: "sysfont:SF-Pro-Display-Bold.otf" } } };
    expect(() => loadConfig(ws(cfg))).toThrow(ConfigError);
  });

  it("rejects an SF locale override when a Play target exists", () => {
    const cfg = { ...base, targets: ["iphone-6.9", "android-phone"], locales: [{ code: "en", fonts: { text: "sysfont:NewYork.ttf" } }] };
    expect(() => loadConfig(ws(cfg))).toThrow(/NewYork/);
  });

  it("rejects duplicate locales and a missing file", () => {
    expect(() => loadConfig(ws({ ...base, locales: [{ code: "en" }, { code: "en" }] }))).toThrow(/duplicate locale/i);
    expect(() => loadConfig(tempDir("empty-"))).toThrow(/shotsmith\.config\.json/);
  });

  it("rejects unknown keys and names the key", () => {
    expect(() => loadConfig(ws({ ...base, ouput: "x" }))).toThrow(/ouput/);
    expect(() => loadConfig(ws({ ...base, locales: [{ code: "en", aple: "en-US" }] }))).toThrow(/aple/);
    expect(() => loadConfig(ws({ ...base, captures: { iphone: { statusbar: "included" } } }))).toThrow(/statusbar/);
    expect(() => loadConfig(ws({ ...base, targets: [{ name: "p", w: 1080, h: 1920, platform: "android-phone", extra: 1 }] }))).toThrow(/extra/);
  });

  it("rejects capture keys that are not platforms", () => {
    expect(() => loadConfig(ws({ ...base, captures: { iphon: {} } }))).toThrow(/captures\.iphon.*platform/s);
    expect(loadConfig(ws({ ...base, captures: { iphone: {}, ipad: {}, "android-phone": {}, "android-tablet": {} } })).captures.ipad).toBeDefined();
  });

  it("rejects duplicate pages", () => {
    expect(() => loadConfig(ws({ ...base, pages: ["a", "a"] }))).toThrow(/duplicate page "a"/i);
  });

  it("rejects page ids that are not plain names", () => {
    for (const id of ["../x", "a/b", "a.b", ""]) expect(() => loadConfig(ws({ ...base, pages: [id] })), id).toThrow(/pages\.0/);
  });

  it("validates custom target names and sizes", () => {
    const t = { name: "pixel", w: 1080, h: 2160, platform: "android-phone" };
    for (const name of ["..", ".", ".hidden", "a/b", ""]) expect(() => loadConfig(ws({ ...base, targets: [{ ...t, name }] })), name).toThrow(/targets\.0\.name/);
    for (const w of [100000, 319, 8193, 1080.5]) expect(() => loadConfig(ws({ ...base, targets: [{ ...t, w }] })), String(w)).toThrow(/targets\.0\.w/);
    expect(loadConfig(ws({ ...base, targets: [{ ...t, name: "pixel_7.a-1" }] })).targets[0].name).toBe("pixel_7.a-1");
  });

  it("limits custom Apple targets to accepted App Store sizes", () => {
    const bad = { name: "x", w: 1000, h: 1700, platform: "iphone" };
    expect(() => loadConfig(ws({ ...base, targets: [bad] }))).toThrow(/1000x1700.*1290x2796.*1179x2556/s);
    expect(() => loadConfig(ws({ ...base, targets: [{ ...bad, platform: "ipad" }] }))).toThrow(/1000x1700.*2048x2732/s);
    expect(loadConfig(ws({ ...base, targets: [{ name: "x", w: 1179, h: 2556, platform: "iphone" }] })).targets[0]).toMatchObject({ w: 1179, h: 2556 });
    expect(loadConfig(ws({ ...base, targets: [{ name: "l", w: 2732, h: 2048, platform: "ipad" }] })).targets[0]).toMatchObject({ w: 2732, h: 2048 });
    expect(loadConfig(ws({ ...base, targets: [{ name: "p", w: 1000, h: 1700, platform: "android-phone" }] })).targets[0].store).toBe("play");
  });

  it("keeps output inside the workspace and away from reserved folders", () => {
    for (const output of ["../shared", "a/../../b", "/abs/path", ".", "./", "out", "inputs", "pages", "fonts", "review", "node_modules", "store/out", "out/x", "Out", ""]) {
      expect(() => loadConfig(ws({ ...base, output })), output).toThrow(/output/);
    }
    expect(loadConfig(ws({ ...base, output: "store/export" })).output).toBe("store/export");
  });

  it("rejects Apple-only fonts in any spelling when a Play target exists", () => {
    const play = ["iphone-6.9", "android-phone"];
    for (const f of ["sysfont:SFArabic.ttf", "sysfont:SF-Compact-Display-Bold.otf", "sysfont:.SFNS.ttf", "sysfont:NewYork.ttf", "sysfont:New York.ttf"]) {
      expect(() => loadConfig(ws({ ...base, targets: play, locales: [{ code: "en", fonts: { text: f } }] })), f).toThrow(/Apple-only/);
    }
    expect(() => loadConfig(ws({ ...base, targets: ["android-phone"], locales: [{ code: "en", fonts: { text: "sysfont:SFArabic.ttf" } }] }))).toThrow(/SFArabic/);
    expect(loadConfig(ws({ ...base, targets: ["iphone-6.9"], locales: [{ code: "en", fonts: { text: "sysfont:SFArabic.ttf" } }] })).targets).toHaveLength(1);
  });
});

describe("Apple helpers", () => {
  it("accepts portrait and landscape App Store sizes only", () => {
    expect(isAcceptedAppleSize("iphone", 1290, 2796)).toBe(true);
    expect(isAcceptedAppleSize("iphone", 2796, 1290)).toBe(true);
    expect(isAcceptedAppleSize("ipad", 2732, 2048)).toBe(true);
    expect(isAcceptedAppleSize("ipad", 1290, 2796)).toBe(false);
    expect(isAcceptedAppleSize("iphone", 1000, 1700)).toBe(false);
    expect(APPLE_SIZES.iphone).toHaveLength(16);
    expect(APPLE_SIZES.ipad).toHaveLength(11);
  });

  it("recognises Apple-only font names", () => {
    for (const n of ["SF Pro", "SFArabic", ".SFNS-Regular", "New York", "NewYork-Bold", "new york medium", "SF-Compact-Display-Bold", ".New York", ".NewYork-Regular"]) expect(isAppleOnlyFontName(n), n).toBe(true);
    for (const n of ["Inter", "Roboto", "Noto Sans", "Helvetica Neue"]) expect(isAppleOnlyFontName(n), n).toBe(false);
  });
});
