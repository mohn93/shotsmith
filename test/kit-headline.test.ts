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
});
