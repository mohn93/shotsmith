import { describe, expect, it } from "vitest";
import { outPath, renderPage } from "../src/render/render.js";
import { makeCaptures } from "./captures.js";
import { pixel, tmpWorkspace, withRenderer } from "./helpers.js";

describe("kit/three", () => {
  it("renders a 3D phone with the capture on its screen", async () => {
    const ws = tmpWorkspace("kit");
    await makeCaptures(ws);
    const res = await withRenderer(ws, (r) => renderPage(r, { page: "three", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "three") }));
    expect(res.sidecar.devices[0]).toMatchObject({ capture: "home" });
    const center = await pixel(res.out, 645, 1398);
    expect(center).not.toEqual([11, 16, 32]);
    expect(center[0] + center[1] + center[2]).toBeGreaterThan(200);
  });
});
