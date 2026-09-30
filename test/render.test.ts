import { execFileSync } from "node:child_process";
import fs from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chromiumArgs } from "../src/render/browser.js";
import { outPath, renderPage } from "../src/render/render.js";
import { ROOT, pixel, tmpWorkspace, withRenderer } from "./helpers.js";

describe("renderer", () => {
  it("picks GPU flags per OS", () => {
    expect(chromiumArgs("darwin")).toContain("--use-angle=metal");
    expect(chromiumArgs("linux")).toContain("--use-angle=swiftshader");
  });

  it("renders a page at the exact target size and writes a sidecar", async () => {
    const ws = tmpWorkspace("basic");
    await withRenderer(ws, async (r) => {
      const out = outPath(r.cfg, "en", "android-phone", "plain");
      const res = await renderPage(r, { page: "plain", target: "android-phone", locale: "en", out });
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 1920]);
      expect(await pixel(out, 10, 10)).toEqual([255, 0, 0]);
      expect(res.sidecar).toMatchObject({ page: "plain", target: "android-phone", locale: "en", kit: false });
      expect(res.sidecar.warnings[0]).toMatch(/did not use the kit/);
      expect(JSON.parse(fs.readFileSync(res.sidecarPath, "utf8")).page).toBe("plain");
    });
  });

  it("reports page errors", async () => {
    const ws = tmpWorkspace("basic");
    await withRenderer(ws, async (r) => {
      await expect(renderPage(r, { page: "broken", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "broken") })).rejects.toThrow(/boom/);
    });
  });

  it("renders from the CLI", () => {
    const ws = tmpWorkspace("basic");
    execFileSync("node", [`${ROOT}/dist/cli.js`, "render", "plain", "-C", ws, "-t", "iphone-6.9"], { encoding: "utf8" });
    expect(fs.existsSync(`${ws}/out/en/iphone-6.9/plain.png`)).toBe(true);
  });
});
