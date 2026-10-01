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

  it("keeps the recess of a tilted lift clean: no source card, no ghost strip", async () => {
    const ws = tmpWorkspace("kit");
    await makeCaptures(ws);
    const res = await withRenderer(ws, (r) => renderPage(r, { page: "lift-tilt", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "lift-tilt") }));
    const s = 1290 / 1260, k = 900 / 1170, deg = 12 * Math.PI / 180, P = 4000;
    // The iPhone frame around a 900 wide screen: bezel 23 + rim 8 on every side, the device origin (180, 260) at its screen.
    const off = 31, ow = 900 + 2 * off, oh = 2532 * k + 2 * off;
    const left = 180 - off, top = 260 - off;
    // A point on the screen plane (capture px) after perspective(4000px) rotateY(12deg) about 50% 40% of the frame, in output px.
    const project = (cx: number, cy: number): [number, number] => {
      const x = off + cx * k - ow / 2, y = off + cy * k - oh * 0.4, w = 1 + (x * Math.sin(deg)) / P;
      return [(left + ow / 2 + (x * Math.cos(deg)) / w) * s, (top + oh * 0.4 + y / w) * s];
    };
    // The recess reaches 2 capture px past the region (90, 600, 1080, 900); its fill is the cream to the left of it.
    const fill = [244, 239, 230];
    const edges: Array<[string, number, number]> = [];
    const [lx, ly] = project(88, 750), [rx, ry] = project(1082, 750), [tx, ty] = project(585, 598), [bx, by] = project(585, 902);
    for (const d of [1, 2]) edges.push([`left +${d}`, Math.round(lx) + d, Math.round(ly)], [`right -${d}`, Math.round(rx) - d, Math.round(ry)],
      [`top +${d}`, Math.round(tx), Math.round(ty) + d], [`bottom -${d}`, Math.round(bx), Math.round(by) - d]);
    for (const [name, x, y] of edges) {
      const p = await pixel(res.out, x, y);
      expect(p[0] > 200 && p[1] > 200 && p[2] > 200, `${name} is not the red card: ${p}`).toBe(true);
      for (let c = 0; c < 3; c++) expect(fill[c] - p[c], `${name} channel ${c} is ${p[c]}, ${fill[c] - p[c]} darker than the fill`).toBeLessThanOrEqual(12);
    }
    const card = await pixel(res.out, ...project(585, 1800).map(Math.round) as [number, number]);
    expect(card[0]).toBeGreaterThan(180); expect(card[1]).toBeLessThan(110);       // the lifted card sits at `at`
  });

  it("rejects a covering card that moves or shrinks", async () => {
    const ws = tmpWorkspace("kit");
    await makeCaptures(ws);
    // The page sets window.__shotsmithError unless every misuse throws the expected error, so a successful render proves it.
    const res = await withRenderer(ws, (r) => renderPage(r, { page: "lift-errors", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "lift-errors") }));
    expect(res.sidecar.lifts).toBe(0);
  });
});
