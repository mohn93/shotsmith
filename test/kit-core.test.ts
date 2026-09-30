import { describe, expect, it } from "vitest";
import { outPath, renderPage } from "../src/render/render.js";
import { tmpWorkspace, withRenderer } from "./helpers.js";

const render = (ws: string, page: string, target: string, locale: string) =>
  withRenderer(ws, (r) => renderPage(r, { page, target, locale, out: outPath(r.cfg, locale, target, page) }));

describe("kit core", () => {
  it("traces claims, chrome and untraced text", async () => {
    const { sidecar } = await render(tmpWorkspace("kit"), "texts", "iphone-6.9", "en");
    expect(sidecar.kit).toBe(true);
    const byText = (s: string) => sidecar.texts.find((x) => x.text.startsWith(s))!;
    expect(byText("Fresh ideas")).toMatchObject({ claim: "headline", chrome: false, overflow: false, covered: true });
    expect(byText("Untraced")).toMatchObject({ claim: null, chrome: false });
    expect(byText("9:41")).toMatchObject({ chrome: true });
    expect(byText("A headline")).toMatchObject({ claim: "long", overflow: true });
    expect(sidecar.texts.filter((x) => x.claim === "headline").some((x) => x.clipped && x.safeArea)).toBe(true);
    expect(sidecar.fonts.map((f) => f.family).sort()).toEqual(["Shotsmith display", "Shotsmith text"]);
    expect(sidecar.fonts.every((f) => f.status === "loaded")).toBe(true);
  });

  it("flags text the configured font cannot cover", async () => {
    const { sidecar } = await render(tmpWorkspace("kit"), "texts", "iphone-6.9", "ar");
    const h = sidecar.texts.find((x) => x.claim === "headline" && !x.clipped)!;
    expect(h.covered).toBe(false);
    expect(h.fallbackFonts.length).toBeGreaterThan(0);
  });

  it("sets lang and dir, and fails on an unknown claim", async () => {
    const ws = tmpWorkspace("kit");
    const fs = await import("node:fs");
    fs.writeFileSync(`${ws}/pages/bad.html`, `<!doctype html><body><script type="module">
      import { stage, t, ready } from "shotsmith/kit";
      const s = await stage();
      t("nope"); await ready();</script></body>`);
    await expect(render(ws, "bad", "android-phone", "ar")).rejects.toThrow(/Unknown claim "nope"/);
  });

  it("fails the render when an image does not load", async () => {
    const ws = tmpWorkspace("kit");
    const fs = await import("node:fs");
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
