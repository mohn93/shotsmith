import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { outPath, renderPage } from "../src/render/render.js";
import { tmpWorkspace, withRenderer } from "./helpers.js";

describe("headline", () => {
  it("fits, shrinks and reports overflow", async () => {
    const ws = tmpWorkspace("kit");
    const { sidecar } = await withRenderer(ws, (r) => renderPage(r, { page: "headline", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "headline") }));
    const texts = sidecar.texts.filter((x) => x.claim);
    const fits = texts.find((x) => x.box[1] < 700 * 1.024)!;
    expect(fits.shrink).toBe(1);
    const shrunk = texts.filter((x) => x.shrink !== null && x.shrink < 1 && !x.overflow);
    expect(shrunk.length).toBeGreaterThan(0);
    expect(shrunk[0].shrink!).toBeGreaterThanOrEqual(0.6);
    expect(texts.some((x) => x.claim === "long" && x.overflow)).toBe(true);
  });

  it("fails the render when the element is not in the page yet", async () => {
    const ws = tmpWorkspace("kit");
    fs.writeFileSync(`${ws}/pages/detached.html`, `<!doctype html><body><script type="module">
      import { stage, headline, ready } from "shotsmith/kit";
      const s = await stage();
      const h = document.createElement("div");
      h.style.cssText = "position:absolute;left:80px;top:200px;width:600px";
      await headline(h, "headline", { maxSize: 200, maxLines: 2 });
      s.root.appendChild(h);
      await ready();</script></body>`);
    await expect(withRenderer(ws, (r) => renderPage(r, { page: "detached", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "detached") })))
      .rejects.toThrow("headline(): add the element to the page before calling headline(), so it can be measured");
  });
});
