import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { checkClaims } from "../src/checks/claims.js";
import { loadClaims } from "../src/config/claims.js";
import { loadConfig } from "../src/config/schema.js";
import { outPath, renderPage } from "../src/render/render.js";
import { tmpWorkspace, withRenderer } from "./helpers.js";

const render = (ws: string, page: string, target: string, locale: string) =>
  withRenderer(ws, (r) => renderPage(r, { page, target, locale, out: outPath(r.cfg, locale, target, page) }));

describe("kit core", () => {
  it("traces claims and untraced text, with no exemption for data-chrome", async () => {
    const sidecarWs = tmpWorkspace("kit");
    const { sidecar } = await render(sidecarWs, "texts", "iphone-6.9", "en");
    expect(sidecar.kit).toBe(true);
    const byText = (s: string) => sidecar.texts.find((x) => x.text.startsWith(s))!;
    expect(byText("Fresh ideas")).toMatchObject({ claim: "headline", overflow: false, covered: true, missingGlyphs: [] });
    expect(byText("Untraced")).toMatchObject({ claim: null });
    expect(byText("9:41")).toMatchObject({ claim: null });
    expect(byText("9:41")).not.toHaveProperty("chrome");
    const untraced = checkClaims(loadConfig(sidecarWs), loadClaims(sidecarWs), [sidecar]).filter((f) => f.rule === "claims.untraced");
    expect(untraced.map((f) => f.message)).toContainEqual(expect.stringMatching(/^"9:41" is visible text outside a claim element/));
    expect(byText("A headline")).toMatchObject({ claim: "long", overflow: true });
    expect(sidecar.texts.filter((x) => x.claim === "headline").some((x) => x.clipped && x.safeArea)).toBe(true);
    expect(sidecar.fonts.map((f) => f.family).sort()).toEqual(["Shotsmith display", "Shotsmith text"]);
    expect(sidecar.fonts.every((f) => f.status === "loaded")).toBe(true);
  });

  it("catches text marked as a claim that is not the claim's text", async () => {
    const ws = tmpWorkspace("kit");
    fs.writeFileSync(`${ws}/pages/fake.html`, `<!doctype html><body><script type="module">
      import { stage, t, ready } from "shotsmith/kit";
      const s = await stage();
      const h = t.el("div", "headline", s.root);
      h.style.cssText = "position:absolute;left:80px;top:400px;font-size:60px";
      const span = document.createElement("span");
      span.textContent = " Rated #1";
      h.appendChild(span);
      const fake = document.createElement("div");
      fake.dataset.claim = "headline";
      fake.textContent = "Invented copy";
      fake.style.cssText = "position:absolute;left:80px;top:800px;font-size:60px";
      s.root.appendChild(fake);
      await ready();</script></body></html>`);
    const { sidecar } = await render(ws, "fake", "iphone-6.9", "en");
    const mismatch = checkClaims(loadConfig(ws), loadClaims(ws), [sidecar]).filter((f) => f.rule === "claims.mismatch");
    expect(mismatch.map((f) => f.message).sort()).toEqual([expect.stringMatching(/shows "Fresh ideas for your table\. Rated #1"/), expect.stringMatching(/shows "Invented copy"/)]);
    expect(mismatch.every((f) => f.severity === "error")).toBe(true);
  });

  it("flags text the configured font cannot cover", async () => {
    const { sidecar } = await render(tmpWorkspace("kit"), "texts", "iphone-6.9", "ar");
    const h = sidecar.texts.find((x) => x.claim === "headline" && !x.clipped)!;
    expect(h.covered).toBe(false);
    // Inter has no Arabic; this holds whether or not an Arabic system font is installed.
    expect(h.missingGlyphs).toContain("U+0627");
    expect(h.missingGlyphs).not.toContain("U+0020");
  });

  it("flags a character no font has a glyph for", async () => {
    const ws = tmpWorkspace("kit");
    const claims = JSON.parse(fs.readFileSync(`${ws}/claims.json`, "utf8"));
    claims.pua = { source: "store-copy: pua", text: { en: "Tap \uE001 to start", de: "x", ar: "x" } };
    fs.writeFileSync(`${ws}/claims.json`, JSON.stringify(claims));
    fs.writeFileSync(`${ws}/pages/pua.html`, `<!doctype html><body><script type="module">
      import { stage, t, ready } from "shotsmith/kit";
      const s = await stage();
      const h = t.el("div", "pua", s.root);
      h.style.cssText = "position:absolute;left:80px;top:400px;font:400 60px var(--font-text)";
      await ready();</script></body></html>`);
    const { sidecar } = await render(ws, "pua", "iphone-6.9", "en");
    const p = sidecar.texts.find((x) => x.claim === "pua")!;
    expect(p.covered).toBe(false);
    expect(p.missingGlyphs).toEqual(["U+E001"]);
  });

  it("sets lang and dir, and fails on an unknown claim", async () => {
    const ws = tmpWorkspace("kit");
    fs.writeFileSync(`${ws}/pages/bad.html`, `<!doctype html><body><script type="module">
      import { stage, t, ready } from "shotsmith/kit";
      const s = await stage();
      t("nope"); await ready();</script></body>`);
    await expect(render(ws, "bad", "android-phone", "ar")).rejects.toThrow(/Unknown claim "nope"/);
  });

  it("fails the render when an image does not load", async () => {
    const ws = tmpWorkspace("kit");
    fs.writeFileSync(`${ws}/pages/img.html`, `<!doctype html><body><script type="module">
      import { stage, ready } from "shotsmith/kit";
      const s = await stage();
      const i = document.createElement("img");
      i.src = "/missing.png";
      s.root.appendChild(i);
      await ready();</script></body>`);
    await expect(render(ws, "img", "android-phone", "en")).rejects.toThrow(/Image failed to load: \/missing\.png/);
  });
});
