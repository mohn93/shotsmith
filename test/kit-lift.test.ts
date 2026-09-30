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

    // The recess must read as an empty slot: no red from the source card 1-2 real px inside any edge of the region.
    const ox = (cx: number) => (180 + cx * k) * s, oy = (cy: number) => (260 + cy * k) * s;
    const midX = Math.round(ox(585)), midY = Math.round(oy(750));
    const edges: Array<[string, number, number]> = [];
    for (const d of [1, 2]) {
      edges.push([`top +${d}`, midX, Math.round(oy(600)) + d], [`bottom -${d}`, midX, Math.round(oy(900)) - d],
        [`left +${d}`, Math.round(ox(90)) + d, midY], [`right -${d}`, Math.round(ox(1080)) - d, midY]);
    }
    for (const [name, x, y] of edges) {
      const p = await pixel(res.out, x, y);
      expect(p[0], `${name} r`).toBeGreaterThan(200); expect(p[1], `${name} g`).toBeGreaterThan(200); // cream, not red-tinted
    }
  });

  it("rejects a covering card that moves or shrinks", async () => {
    const ws = tmpWorkspace("kit");
    await makeCaptures(ws);
    // The page sets window.__shotsmithError unless every misuse throws the expected error, so a successful render proves it.
    const res = await withRenderer(ws, (r) => renderPage(r, { page: "lift-errors", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "lift-errors") }));
    expect(res.sidecar.lifts).toBe(0);
  });
});
