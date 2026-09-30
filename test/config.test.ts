import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/schema.js";

function ws(config: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shotsmith-config-"));
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
    expect(() => loadConfig(fs.mkdtempSync(path.join(os.tmpdir(), "empty-")))).toThrow(/shotsmith\.config\.json/);
  });
});
