import { describe, expect, it } from "vitest";
import { outPath, renderPage } from "../src/render/render.js";
import { makeCaptures } from "./captures.js";
import { pixel, tmpWorkspace, withRenderer } from "./helpers.js";

describe("lift", () => {
  it("leaves a recess in the source region and places the card elsewhere", async () => {
    const ws = tmpWorkspace("kit");
    await makeCaptures(ws);
    const res = await withRenderer(ws, (r) => renderPage(r, { page: "lift", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "lift") }));
    expect(res.sidecar.lifts).toBe(1);
    const s = 1290 / 1260, k = 900 / 1170;
    // Center of the source region on stage: x = 180 + 585*k, y = 260 + 750*k (included status bar, no top band).
    const src = await pixel(res.out, Math.round((180 + 585 * k) * s), Math.round((260 + 750 * k) * s));
    expect(src[0]).toBeGreaterThan(200); expect(src[1]).toBeGreaterThan(200);      // cream recess, not the red card
    const card = await pixel(res.out, Math.round(630 * s), Math.round(2500 * s));
    expect(card[0]).toBeGreaterThan(180); expect(card[1]).toBeLessThan(110);       // red card content
  });
});
