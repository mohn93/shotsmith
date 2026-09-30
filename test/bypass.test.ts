import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { findSysFont } from "../src/render/fonts.js";
import { makeCaptures } from "./captures.js";
import { ROOT, tmpWorkspace } from "./helpers.js";

// Every route the bypass reviewer used to get a wrong set past `shotsmith build`. Each one now fails with a named rule.

interface Result { code: number; rules: string[]; findings: { rule: string; page?: string; message: string }[]; error?: string }

// Asynchronous, so the concurrent route tests really run side by side.
async function cli(ws: string, ...args: string[]): Promise<Result> {
  let out: string, code = 0;
  try { out = (await promisify(execFile)("node", [`${ROOT}/dist/cli.js`, ...args, "-C", ws, "--json"], { encoding: "utf8" })).stdout; }
  catch (e: any) { out = String(e.stdout); code = e.code as number; }
  const res = JSON.parse(out);
  const findings = [...(res.errors ?? []), ...(res.warnings ?? [])];
  return { code, rules: (res.errors ?? []).map((f: any) => f.rule), findings, error: res.error?.message };
}

// The kit fixture reduced to one page, one target and English, with captures.
async function workspace(page: string, o: { target?: string; locales?: string[]; html?: string; config?: (c: any) => void } = {}): Promise<string> {
  const ws = tmpWorkspace("kit");
  await makeCaptures(ws);
  const cfg = JSON.parse(fs.readFileSync(`${ws}/shotsmith.config.json`, "utf8"));
  cfg.pages = [page];
  cfg.targets = [o.target ?? "iphone-6.9"];
  cfg.locales = (o.locales ?? ["en"]).map((code) => ({ code }));
  o.config?.(cfg);
  fs.writeFileSync(`${ws}/shotsmith.config.json`, JSON.stringify(cfg));
  const claims = JSON.parse(fs.readFileSync(`${ws}/claims.json`, "utf8"));
  delete claims.long;
  fs.writeFileSync(`${ws}/claims.json`, JSON.stringify(claims));
  for (const l of o.locales ?? []) if (l !== "en") for (const p of ["iphone", "android-phone"]) {
    fs.mkdirSync(`${ws}/inputs/${p}/${l}`, { recursive: true });
    fs.copyFileSync(`${ws}/inputs/${p}/en/home.png`, `${ws}/inputs/${p}/${l}/home.png`);
  }
  if (o.html) fs.writeFileSync(`${ws}/pages/${page}.html`, o.html);
  return ws;
}

// A kit page showing the headline claim through `claim` (markup inside the stage) plus `extra` script.
const page = (claim: string, o: { head?: string; extra?: string } = {}) => `<!doctype html><html><head><meta charset="utf-8">${o.head ?? ""}</head><body>
<script type="module">
import { stage, t, ready } from "shotsmith/kit";
const s = await stage();
s.root.insertAdjacentHTML("beforeend", ${JSON.stringify(claim)});
${o.extra ?? ""}
</script></body></html>`;
const HEADLINE_STYLE = "position:absolute;left:80px;top:300px;width:1100px;font:700 80px var(--font-display);color:#fff";

const expectRule = (r: Result, rule: string, pageName?: string) => {
  expect(r.code, JSON.stringify(r.findings)).toBe(1);
  expect(r.findings, r.rules.join(", ")).toContainEqual(expect.objectContaining({ rule, ...(pageName ? { page: pageName } : {}) }));
};

describe("bypass routes: text not taken from claims.json", () => {
  // The Task 6 evidence pages each show "Free forever" beside the traced headline.
  for (const route of ["after", "attr", "marker", "canvas", "offscreen", "iframe", "input", "textarea", "svg-bg", "shadow-open", "shadow-closed",
    "shadow-early", "classic-canvas", "classic-closed", "hidden-parent", "alt"]) {
    it.concurrent(`${route} gives claims.untraced`, async () => {
      const name = `evidence-${route}`;
      const r = await cli(await workspace(name), "build");
      expectRule(r, "claims.untraced", name);
    });
  }
});

describe("bypass routes: claim elements that do not show their claim", () => {
  const cases: [string, string][] = [
    ["partial", `<div data-claim="headline" style="${HEADLINE_STYLE}">Fresh ideas</div>`],
    ["reordered", `<div data-claim="headline" style="${HEADLINE_STYLE};display:flex;flex-direction:row-reverse;justify-content:flex-end;gap:20px"><span>for your table.</span><span>Fresh ideas</span></div>`],
    ["transparent", `<div data-claim="headline" style="${HEADLINE_STYLE}">Fresh ideas <span style="color:transparent">for your table.</span></div>`],
  ];
  for (const [name, claim] of cases) {
    it.concurrent(`${name} gives claims.mismatch`, async () => {
      const r = await cli(await workspace(name, { html: page(claim, { extra: "await ready();" }) }), "build");
      expectRule(r, "claims.mismatch", name);
    });
  }
});

const HEADLINE = `<div data-claim="headline" style="${HEADLINE_STYLE}">Fresh ideas for your table.</div>`;

describe("list markers and pseudo content", () => {
  it.concurrent("passes a bullet list marker and a check-mark ::before", async () => {
    const html = page(`<ul style="${HEADLINE_STYLE};list-style:'\u2022 '"><li class="tick" data-claim="headline">Fresh ideas for your table.</li></ul>`, {
      head: "<style>.tick::before{content:'\u2713 '}</style>", extra: "await ready();" });
    const r = await cli(await workspace("bullets", { html }), "build");
    expect(r.findings.filter((f) => f.rule.startsWith("claims.")), JSON.stringify(r.findings)).toEqual([]);
    expect(r.code, JSON.stringify(r.findings)).toBe(0);
  });

  it.concurrent("fails a numbered list and says to put the numbers in claim text", async () => {
    const html = page(`<ol style="${HEADLINE_STYLE}"><li data-claim="headline">Fresh ideas for your table.</li></ol>`, { extra: "await ready();" });
    const r = await cli(await workspace("numbered", { html }), "build");
    expectRule(r, "claims.untraced", "numbered");
    expect(r.findings.find((f) => f.rule === "claims.untraced")!.message).toMatch(/^marker: "decimal" .*numbered lists must put their numbers in claim text/);
  });
});

describe("bypass routes: Apple-only fonts on Google Play", () => {
  it("rejects a locale font sysfont:SFArabic.ttf as a config error", async () => {
    const ws = await workspace("screen", { target: "android-phone", config: (c) => { c.locales[0].fonts = { display: "sysfont:SFArabic.ttf" }; } });
    const r = await cli(ws, "build");
    expect(r.code).toBe(2);
    expect(r.error).toMatch(/SFArabic\.ttf is Apple-only/);
  });

  const sfns = findSysFont("SFNS.ttf");
  it.skipIf(!sfns)("gives font.appleOnly for SF copied into fonts/ under another name", async () => {
    const ws = await workspace("brand", { target: "android-phone", html: page(HEADLINE, { extra: "await ready();" }), config: (c) => { c.fonts.display.play = "fonts/Brand.ttf"; } });
    fs.copyFileSync(sfns!, `${ws}/fonts/Brand.ttf`);
    const r = await cli(ws, "build");
    expectRule(r, "font.appleOnly", "brand");
    expect(r.findings.find((f) => f.rule === "font.appleOnly")!.message).toMatch(/\/fonts\/Brand\.ttf/);
  });

  it.skipIf(!findSysFont("SF-Compact-Display-Bold.otf"))("gives font.appleOnly for a page @font-face loading /sysfont/SF-Compact-Display-Bold.otf", async () => {
    const html = page(`<div data-claim="headline" style="${HEADLINE_STYLE};font-family:Brand">Fresh ideas for your table.</div>`, {
      head: "<style>@font-face{font-family:Brand;src:url(/sysfont/SF-Compact-Display-Bold.otf)}</style>",
      extra: "await document.fonts.ready; await ready();",
    });
    const r = await cli(await workspace("sf", { target: "android-phone", html }), "build");
    expectRule(r, "font.appleOnly", "sf");
    expect(r.findings.find((f) => f.rule === "font.appleOnly")!.message).toMatch(/SF-Compact-Display-Bold\.otf is SF Compact Display/);
  });
});

describe("bypass routes: captures, sidecars and exports", () => {
  it("gives capture.crossPlatform for an iPhone capture on android-phone", async () => {
    const html = page(HEADLINE, { extra: `const i = document.createElement("img"); i.src = "/inputs/iphone/en/home.png"; i.style.cssText = "position:absolute;left:80px;top:700px;width:400px"; s.root.appendChild(i); await i.decode(); await ready();` });
    const r = await cli(await workspace("cross", { target: "android-phone", html }), "build");
    expectRule(r, "capture.crossPlatform", "cross");
  });

  it("gives render.changedAfterReady for text appended after ready()", async () => {
    const html = page(HEADLINE, { extra: `await ready(); const x = document.createElement("div"); x.textContent = "Free forever"; s.root.appendChild(x);` });
    const r = await cli(await workspace("late", { html }), "build");
    expectRule(r, "render.changedAfterReady", "late");
  });

  it("gives render.corrupt from check for a truncated sidecar", async () => {
    const ws = await workspace("screen", { target: "android-phone" });
    expect((await cli(ws, "build")).code).toBe(0);
    const file = `${ws}/out/en/android-phone/screen.sidecar.json`;
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").slice(0, 100));
    const r = await cli(ws, "check");
    expectRule(r, "render.corrupt", "screen");
  });

  it("gives store.stale for a PNG next to the page JPEG, which build then removes", async () => {
    const ws = await workspace("screen", { target: "android-phone" });
    expect((await cli(ws, "build")).code).toBe(0);
    fs.copyFileSync(`${ws}/out/en/android-phone/screen.png`, `${ws}/export/en/android-phone/screen.png`);
    expectRule(await cli(ws, "check"), "store.stale");
    expect((await cli(ws, "build")).code).toBe(0);
    expect(fs.existsSync(`${ws}/export/en/android-phone/screen.png`)).toBe(false);
  });

  it("gives store.stale for a removed locale's folder, which build empties and removes", async () => {
    const ws = await workspace("screen", { target: "android-phone", locales: ["en", "de"] });
    expect((await cli(ws, "build")).code).toBe(0);
    const cfg = JSON.parse(fs.readFileSync(`${ws}/shotsmith.config.json`, "utf8"));
    cfg.locales = [{ code: "en" }];
    fs.writeFileSync(`${ws}/shotsmith.config.json`, JSON.stringify(cfg));
    const c = await cli(ws, "check");
    expectRule(c, "store.stale");
    expect(c.findings.filter((f) => f.rule === "store.stale").map((f) => f.message.split(" ")[0]).sort()).toEqual(["export/contact-sheets/de-android-phone.jpg", "export/de/"]);
    // Build deletes its images, then the folders that left empty, so the next build passes.
    expect((await cli(ws, "build")).code).toBe(0);
    expect(fs.existsSync(`${ws}/export/de`)).toBe(false);
    expect(fs.existsSync(`${ws}/export/contact-sheets/de-android-phone.jpg`)).toBe(false);
    expect(fs.existsSync(`${ws}/export/en/android-phone/screen.jpg`)).toBe(true);
  });

  it("keeps and reports a removed locale's folder that still holds other files", async () => {
    const ws = await workspace("screen", { target: "android-phone" });
    fs.mkdirSync(`${ws}/export/de/android-phone`, { recursive: true });
    fs.writeFileSync(`${ws}/export/de/android-phone/screen.jpg`, "x");
    fs.writeFileSync(`${ws}/export/de/notes.txt`, "keep");
    const r = await cli(ws, "build");
    expect(r.rules).toEqual(["store.stale"]);
    expect(r.findings.find((f) => f.rule === "store.stale")!.message).toMatch(/^export\/de\//);
    expect(fs.readFileSync(`${ws}/export/de/notes.txt`, "utf8")).toBe("keep");
    expect(fs.existsSync(`${ws}/export/de/android-phone`)).toBe(false);
  });

  it("gives store.stale for a folder named extra.png in an export folder, without crashing build", async () => {
    const ws = await workspace("screen", { target: "android-phone" });
    fs.mkdirSync(`${ws}/export/en/android-phone/extra.png`, { recursive: true });
    const r = await cli(ws, "build");
    expectRule(r, "store.stale");
    expect(r.rules).toEqual(["store.stale"]);
    expect(fs.statSync(`${ws}/export/en/android-phone/extra.png`).isDirectory()).toBe(true);
  });
});
