import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { outPath, renderPage } from "../src/render/render.js";
import { makeCaptures } from "./captures.js";
import { pixel, tmpWorkspace, withRenderer } from "./helpers.js";

let ws: string;
beforeAll(async () => {
  ws = tmpWorkspace("kit");
  await makeCaptures(ws);
});
const render = (dir: string, page: string, target: string, locale = "en") =>
  withRenderer(dir, (r) => renderPage(r, { page, target, locale, out: outPath(r.cfg, locale, target, page) }));

describe("capture()", () => {
  it("loads a capture for page art and records it", async () => {
    const { sidecar, out } = await render(ws, "capture", "iphone-6.9");
    expect(sidecar.captures).toEqual(["/inputs/iphone/en/home.png"]);
    expect(sidecar.devices).toEqual([]);
    // The cropped card row (#e0402a in the capture) sits at stage (135..1125, 400..700), scaled by 1290/1260.
    const [r, g, b] = await pixel(out, Math.round(600 * 1290 / 1260), Math.round(550 * 1290 / 1260));
    expect(r).toBeGreaterThan(200); expect(g).toBeLessThan(90); expect(b).toBeLessThan(70);
  });

  it("uses the platform's own capture and warns on locale fallback", async () => {
    expect((await render(ws, "capture", "android-phone")).sidecar.captures).toEqual(["/inputs/android-phone/en/home.png"]);
    expect((await render(ws, "capture", "iphone-6.9", "de")).sidecar.warnings.some((w) => w.startsWith("capture.fallback: "))).toBe(true);
  });

  it("fails clearly for a missing capture", async () => {
    const src = fs.readFileSync(`${ws}/pages/capture.html`, "utf8");
    fs.writeFileSync(`${ws}/pages/capture-missing.html`, src.replace('q.get("c") ?? "home"', '"nothere"'));
    await expect(render(ws, "capture-missing", "iphone-6.9")).rejects.toThrow(/No capture "nothere" for iphone/);
  });
});

describe("file names with URL characters", () => {
  it("loads captures and fonts whose names contain spaces, #, ? and %", async () => {
    const dir = tmpWorkspace("kit");
    await makeCaptures(dir);
    fs.renameSync(path.join(dir, "inputs/iphone/en/home.png"), path.join(dir, "inputs/iphone/en/my home#1?%.png"));
    fs.copyFileSync(path.join(dir, "fonts/Inter-Bold.ttf"), path.join(dir, "fonts/Inter Bold #2.ttf"));
    const cfgFile = path.join(dir, "shotsmith.config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    cfg.fonts.display = { apple: "fonts/Inter Bold #2.ttf", play: "fonts/Inter Bold #2.ttf" };
    fs.writeFileSync(cfgFile, JSON.stringify(cfg));
    const src = fs.readFileSync(`${dir}/pages/device.html`, "utf8");
    fs.writeFileSync(`${dir}/pages/device-odd.html`, src.replace('q.get("c") ?? "home"', '"my home#1?%"'));
    fs.writeFileSync(`${dir}/pages/capture-odd.html`, fs.readFileSync(`${dir}/pages/capture.html`, "utf8").replace('q.get("c") ?? "home"', '"my home#1?%"'));

    const d = await render(dir, "device-odd", "iphone-6.9");
    expect(d.sidecar.captures).toEqual(["/inputs/iphone/en/my home#1?%.png"]);
    expect(d.sidecar.fonts.some((f) => f.url === "/fonts/Inter Bold #2.ttf")).toBe(true);
    expect((await render(dir, "capture-odd", "iphone-6.9")).sidecar.captures).toEqual(["/inputs/iphone/en/my home#1?%.png"]);
  });
});
