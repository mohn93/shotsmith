import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/schema.js";
import { checkInputs } from "../src/checks/inputs.js";
import { checkSidecars, loadSidecars } from "../src/checks/sidecars.js";
import { checkExports, exportPath } from "../src/checks/store.js";
import { outPath } from "../src/render/render.js";
import { emptySidecar, type Sidecar, sidecarPath } from "../src/shared/sidecar.js";
import { tempDir } from "./helpers.js";

function ws(targets: unknown[], pages = ["a", "b"]): string {
  const dir = tempDir("check-");
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
    // A PNG saved under the page's .jpg name.
    await sharp({ create: { width: 1290, height: 2790, channels: 4, background: "#3366" } }).png().toFile(file("iphone-6.9", "b"));
    await sharp({ create: { width: 1290, height: 2796, channels: 3, background: "#336" } }).jpeg().toFile(file("iphone-6.9", "old"));
    await sharp({ create: { width: 1080, height: 2400, channels: 3, background: "#336" } }).jpeg({ chromaSubsampling: "4:4:4" }).toFile(file("tall-play", "a"));
    expect(rules(await checkExports(cfg))).toEqual(["store.alpha", "store.aspect", "store.chroma", "store.format", "store.missing", "store.progressive", "store.size", "store.stale"]);
  });

  it("reports everything in the output folder that is not a configured export", async () => {
    const dir = ws(["iphone-6.9"], ["a"]);
    const cfg = loadConfig(dir);
    const out = path.join(dir, "export");
    const put = (rel: string, data: string | Buffer = "x") => { fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); fs.writeFileSync(path.join(out, rel), data); };
    put("en/iphone-6.9/a.jpg", await sharp({ create: { width: 1290, height: 2796, channels: 3, background: "#336" } }).jpeg({ chromaSubsampling: "4:4:4" }).toBuffer());
    for (const ok of ["contact-sheets/en-iphone-6.9.jpg", "REPORT.md", "upload-apple.json", "en/iphone-6.9/.DS_Store"]) put(ok);
    for (const bad of ["en/iphone-6.9/a.png", "en/iphone-6.9/a.jpeg", "en/iphone-6.9/notes.txt", "en/old-target/a.jpg", "fr/iphone-6.9/a.jpg", "contact-sheets/fr-iphone-6.9.jpg", "contact-sheets/en-iphone-6.9.png", "notes.txt", "a.jpg"]) put(bad);
    fs.mkdirSync(path.join(out, "en/iphone-6.9/extra.png"));
    const stale = (await checkExports(cfg)).filter((f) => f.rule === "store.stale").map((f) => f.message.split(" ")[0]).sort();
    expect(stale).toEqual(["export/a.jpg", "export/contact-sheets/en-iphone-6.9.png", "export/contact-sheets/fr-iphone-6.9.jpg", "export/en/iphone-6.9/a.jpeg",
      "export/en/iphone-6.9/a.png", "export/en/iphone-6.9/extra.png/", "export/en/iphone-6.9/notes.txt", "export/en/old-target/", "export/fr/", "export/notes.txt"]);
    expect((await checkExports(cfg)).filter((f) => f.rule !== "store.stale")).toEqual([]);
  });

  it("reports an Apple target whose size App Store Connect does not accept", async () => {
    const cfg = loadConfig(ws(["iphone-6.9"], ["a"]));
    cfg.targets.push({ name: "odd", w: 1000, h: 2000, platform: "iphone", store: "apple", formFactor: "p916" });
    expect((await checkExports(cfg)).filter((f) => f.rule === "store.appleSize")).toEqual([expect.objectContaining({ target: "odd", severity: "error" })]);
  });

  it("turns sidecars into findings", () => {
    const dir = ws(["android-phone"], ["a"]);
    const cfg = loadConfig(dir);
    const text = { el: 0, claim: "h", chrome: false, text: "Hi", box: [0, 0, 10, 10] as [number, number, number, number], font: "x", overflow: true, clipped: false, safeArea: true, shrink: 0.7, covered: false, fallbackFonts: ["Geeza Pro"] };
    const sc: Sidecar = { page: "a", target: "android-phone", locale: "en", kit: true, texts: [text], captures: [], devices: [], lifts: 0, requests: { captures: [], fonts: [] }, changedAfterReady: false, generated: [], claimsShown: [],
      fonts: [{ family: "Shotsmith display", weight: "700", url: "/sysfont/SF-Pro-Display-Bold.otf", status: "loaded" }], warnings: ["capture.fallback: x"],
      servedFonts: [{ url: "/sysfont/SF-Pro-Display-Bold.otf", names: ["SF Pro Display", "SFProDisplay-Bold"], appleOnly: true }] };
    const f = checkSidecars(cfg, [sc]);
    expect(rules(f)).toEqual(["capture.fallback", "font.appleOnly", "text.coverage", "text.overflow", "text.safeArea", "text.shrink"]);
    expect(f.find((x) => x.rule === "text.shrink")!.severity).toBe("warning");
    expect(loadSidecars(cfg).findings.map((x) => x.rule)).toEqual(["render.missing"]);
  });

  it("reports Apple-only fonts on Play targets by the names inside the font, whatever the file is called", () => {
    const cfg = loadConfig(ws(["android-phone", "iphone-6.9"], ["a"]));
    const text = (t: string, fallbackFonts: string[], usedFonts: string[]) => ({ el: 0, claim: "h", chrome: false, text: t, box: [0, 0, 10, 10] as [number, number, number, number], font: "x", overflow: false, clipped: false, safeArea: false, shrink: null, covered: true, fallbackFonts, usedFonts });
    const sc = (target: string): Sidecar => ({ page: "a", target, locale: "en", kit: true, captures: [], devices: [], lifts: 0, requests: { captures: [], fonts: [] }, changedAfterReady: false, generated: [], claimsShown: [], fonts: [], warnings: [],
      servedFonts: [{ url: "/fonts/Brand.otf", names: ["SF Compact Display", "SFCompactDisplay-Bold"], appleOnly: true }, { url: "/fonts/Inter.ttf", names: ["Inter"], appleOnly: false }],
      texts: [text("Brand", [], ["SF Compact Display", "SFCompactDisplay-Bold"]), text("Sys", [".SF NS"], [".SF NS", ".SFNS-Regular"]), text("Sys again", [".SF NS"], [".SF NS"]), text("Data", [], ["New York", "NewYork-Bold"]), text("Ok", [], ["Inter"])] });
    const f = checkSidecars(cfg, [sc("android-phone"), sc("iphone-6.9")]);
    expect(f.map((x) => `${x.rule} ${x.target}`)).toEqual(Array(3).fill("font.appleOnly android-phone"));
    expect(f.map((x) => x.message)).toEqual([expect.stringMatching(/^\/fonts\/Brand\.otf is SF Compact Display/), expect.stringMatching(/"Sys" is drawn with \.SF NS/), expect.stringMatching(/"Data" is drawn with New York/)]);
    for (const x of f) expect(x.message).toMatch(/; use the configured Play font \(fonts\.<role>\.play\) on Google Play targets$/);
  });

  it("reports cross-platform captures and text changed after ready()", () => {
    const cfg = loadConfig(ws(["android-phone", "iphone-6.9"], ["a"]));
    const sc = (target: string, captures: string[], changedAfterReady = false): Sidecar => ({ page: "a", target, locale: "en", kit: true, texts: [], fonts: [], captures: [], devices: [], lifts: 0, warnings: [], generated: [], claimsShown: [], servedFonts: [], requests: { captures, fonts: [] }, changedAfterReady });
    const f = checkSidecars(cfg, [sc("android-phone", ["/inputs/iphone/en/home.png", "/inputs/android-phone/en/home.png", "/inputs/logo.png"]), sc("iphone-6.9", ["/inputs/iphone/en/home.png"], true)]);
    expect(f.map((x) => `${x.rule} ${x.target}`)).toEqual(["capture.crossPlatform android-phone", "render.changedAfterReady iphone-6.9"]);
    expect(f[0].message).toMatch(/\/inputs\/iphone\/en\/home\.png/);
    expect(f[1].message).toMatch(/do not change text after ready\(\)$/);
  });

  it("reports unreadable and incomplete sidecars as render.corrupt instead of crashing", () => {
    const cfg = loadConfig(ws(["android-phone"], ["a", "b", "c"]));
    const put = (page: string, body: string) => { const f = sidecarPath(outPath(cfg, "en", "android-phone", page)); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
    const good = { ...emptySidecar("a", "android-phone", "en", "x"), kit: true, warnings: [] };
    put("a", JSON.stringify(good).slice(0, 40));
    put("b", JSON.stringify({ ...good, texts: undefined }));
    put("c", JSON.stringify({ ...good, page: "elsewhere" }));
    const { sidecars, findings } = loadSidecars(cfg);
    expect(findings.map((x) => `${x.rule} ${x.page}`)).toEqual(["render.corrupt a", "render.corrupt b"]);
    expect(findings[0].message).toMatch(/out\/en\/android-phone\/a\.sidecar\.json/);
    expect(findings[1].message).toMatch(/lacks texts/);
    expect(sidecars.map((s) => s.page)).toEqual(["c"]);
  });

  it("fails a page that does not use the kit", () => {
    const cfg = loadConfig(ws(["android-phone"], ["a"]));
    const f = checkSidecars(cfg, [emptySidecar("a", "android-phone", "en", "kit.unused: page did not use the kit; its text and fonts were not checked")]);
    expect(f).toEqual([expect.objectContaining({ rule: "kit.unused", severity: "error", page: "a" })]);
  });

  it("reports characters the configured font has no glyph for", () => {
    const cfg = loadConfig(ws(["android-phone"], ["a"]));
    const text = { el: 0, claim: "h", chrome: false, text: "Tap \uE001", box: [0, 0, 10, 10] as [number, number, number, number], font: "x", overflow: false, clipped: false, safeArea: false, shrink: null, covered: false, fallbackFonts: [], missingGlyphs: ["U+E001"] };
    const sc: Sidecar = { page: "a", target: "android-phone", locale: "en", kit: true, texts: [text], captures: [], devices: [], lifts: 0, requests: { captures: [], fonts: [] }, changedAfterReady: false, generated: [], claimsShown: [], servedFonts: [], fonts: [], warnings: [] };
    const f = checkSidecars(cfg, [sc]);
    expect(f).toEqual([expect.objectContaining({ rule: "text.coverage", severity: "error", message: expect.stringContaining("U+E001") })]);
  });
});
