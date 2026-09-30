import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { outPath, renderPage } from "../src/render/render.js";
import { makeCaptures } from "./captures.js";
import { compareBaseline, pixel, tmpWorkspace, withRenderer } from "./helpers.js";

let ws: string;
beforeAll(async () => {
  ws = tmpWorkspace("kit");
  await makeCaptures(ws);
  const src = fs.readFileSync(`${ws}/pages/device.html`, "utf8");
  fs.writeFileSync(`${ws}/pages/device-missing.html`, src.replace('q.get("c") ?? "home"', '"nothere"'));
  fs.writeFileSync(`${ws}/pages/device-repaint.html`, src.replace('repaint: q.has("repaint")', "repaint: true"));
});
const render = (page: string, target: string, locale = "en") =>
  withRenderer(ws, (r) => renderPage(r, { page, target, locale, out: outPath(r.cfg, locale, target, page) }));

describe("device", () => {
  it("adds status and home bands for captures without a status bar", async () => {
    const { sidecar } = await render("device", "android-phone");
    expect(sidecar.devices[0]).toMatchObject({ platform: "android-phone", capture: "home", statusBar: "none" });
    expect(sidecar.devices[0].screen[1]).toBeGreaterThan(2400);
    expect(sidecar.captures).toEqual(["/inputs/android-phone/en/home.png"]);
  });

  it("uses included status bars as they are", async () => {
    const { sidecar } = await render("device", "iphone-6.9");
    expect(sidecar.devices[0]).toMatchObject({ statusBar: "included", repaint: false, screen: [1170, 2532] });
    const repainted = await render("device-repaint", "iphone-6.9");
    expect(repainted.sidecar.devices[0]).toMatchObject({ statusBar: "included", repaint: true, screen: [1170, 2532] });
  });

  it("draws the dynamic island only when repaint is on", async () => {
    // Island centre in capture px is (585, 88). Device at x=180, y=260, width=900 shows the 1170 px capture at k = 900/1170;
    // the render is scaled by 1290/1260.
    const k = 900 / 1170, sc = 1290 / 1260;
    const px = Math.round((180 + 585 * k) * sc), py = Math.round((260 + 88 * k) * sc);
    const sum = (c: number[]) => c[0] + c[1] + c[2];
    const plain = await render("device", "iphone-6.9");
    const repainted = await render("device-repaint", "iphone-6.9");
    expect(sum(await pixel(repainted.out, px, py))).toBeLessThan(40);
    expect(sum(await pixel(plain.out, px, py))).toBeGreaterThan(60);
  });

  it("warns when a capture falls back to another locale", async () => {
    const { sidecar } = await render("device", "iphone-6.9", "de");
    expect(sidecar.warnings.some((w) => w.startsWith("capture.fallback: "))).toBe(true);
  });

  it("fails clearly when a capture is missing", async () => {
    await expect(render("device-missing", "iphone-6.9")).rejects.toThrow(/No capture "nothere" for iphone \(looked in inputs\/iphone\/en\/, inputs\/iphone\/\); available: home/);
  });

  for (const target of ["iphone-6.9", "android-phone", "ipad-13", "android-tablet"]) {
    it(`matches the ${target} frame baseline`, async () => {
      const { out } = await render("device", target);
      await compareBaseline(out, `device-${target}`);
    });
  }
});
