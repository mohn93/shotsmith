import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chromiumArgs } from "../src/render/browser.js";
import { outPath, renderPage, renderVideo } from "../src/render/render.js";
import { ROOT, pixel, tempDir, tmpWorkspace, withRenderer } from "./helpers.js";

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

  it("fails fast when the page does not exist", async () => {
    const ws = tmpWorkspace("basic");
    await withRenderer(ws, async (r) => {
      const started = Date.now();
      await expect(renderPage(r, { page: "nope", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "nope") })).rejects.toThrow(/not found/);
      expect(Date.now() - started).toBeLessThan(20000);
    });
  });

  it("fails fast when a page module does not link", async () => {
    const ws = tmpWorkspace("basic");
    fs.writeFileSync(`${ws}/pages/link.html`, `<!doctype html><body><script type="module">
      import { stage, nope } from "shotsmith/kit";
      await stage();</script></body></html>`);
    await withRenderer(ws, async (r) => {
      const started = Date.now();
      await expect(renderPage(r, { page: "link", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "link") })).rejects.toThrow(/does not provide an export named 'nope'/);
      expect(Date.now() - started).toBeLessThan(20000);
    });
  });

  it("reports a missing ffmpeg instead of crashing", async () => {
    const ws = tmpWorkspace("basic");
    await withRenderer(ws, async (r) => {
      const emptyBin = tempDir("shotsmith-nobin-");
      const savedPath = process.env.PATH;
      process.env.PATH = emptyBin;
      try {
        const out = outPath(r.cfg, "en", "iphone-6.9", "video").replace(/\.png$/, ".mp4");
        await expect(renderVideo(r, { page: "video", target: "iphone-6.9", locale: "en", out }, { fps: 2, duration: 1 })).rejects.toThrow(/ffmpeg/);
      } finally {
        process.env.PATH = savedPath;
        fs.rmSync(emptyBin, { recursive: true, force: true });
      }
    });
  });

  it("refuses a still render to a file that is not a .png", async () => {
    const ws = tmpWorkspace("basic");
    fs.writeFileSync(`${ws}/keep.jpg`, "keep");
    let res: { code: number; err: string } = { code: 0, err: "" };
    try { execFileSync("node", [`${ROOT}/dist/cli.js`, "render", "plain", "-C", ws, "-o", `${ws}/keep.jpg`], { encoding: "utf8", stdio: "pipe" }); }
    catch (e: any) { res = { code: e.status, err: String(e.stderr) }; }
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/--out must end in \.png/);
    expect(fs.readFileSync(`${ws}/keep.jpg`, "utf8")).toBe("keep");
    await withRenderer(ws, async (r) => {
      await expect(renderPage(r, { page: "plain", target: "iphone-6.9", locale: "en", out: `${ws}/keep.jpg` })).rejects.toThrow(/must be a \.png/);
    });
    expect(fs.readFileSync(`${ws}/keep.jpg`, "utf8")).toBe("keep");
  });

  it("refuses page names, targets and locales that could leave the workspace", async () => {
    const ws = tmpWorkspace("basic");
    const run = (...args: string[]) => {
      try { execFileSync("node", [`${ROOT}/dist/cli.js`, "render", ...args, "-C", ws], { encoding: "utf8", stdio: "pipe" }); return { code: 0, err: "" }; }
      catch (e: any) { return { code: e.status as number, err: String(e.stderr) }; }
    };
    expect(run("../plain")).toMatchObject({ code: 2, err: expect.stringMatching(/Page name "\.\.\/plain"/) });
    expect(run("plain", "-l", "../../x")).toMatchObject({ code: 2, err: expect.stringMatching(/Unknown locale/) });
    expect(run("plain", "-t", "../x")).toMatchObject({ code: 2, err: expect.stringMatching(/Unknown target/) });
    expect(fs.existsSync(`${ws}/out`)).toBe(false);
    await withRenderer(ws, async (r) => {
      await expect(renderPage(r, { page: "../pages/plain", target: "iphone-6.9", locale: "en", out: `${ws}/x.png` })).rejects.toThrow(/Page name/);
    });
  });

  it("renders from the CLI", () => {
    const ws = tmpWorkspace("basic");
    execFileSync("node", [`${ROOT}/dist/cli.js`, "render", "plain", "-C", ws, "-t", "iphone-6.9"], { encoding: "utf8" });
    expect(fs.existsSync(`${ws}/out/en/iphone-6.9/plain.png`)).toBe(true);
  });
});
