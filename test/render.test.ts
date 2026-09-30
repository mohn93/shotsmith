import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chromiumArgs } from "../src/render/browser.js";
import { outPath, renderPage, renderVideo } from "../src/render/render.js";
import { sidecarPath } from "../src/shared/sidecar.js";
import { ROOT, pixel, tempDir, tmpWorkspace, withRenderer } from "./helpers.js";

// Processes whose command line mentions this path (pgrep exits 1 when there are none).
function processesFor(file: string): string {
  try { return execFileSync("pgrep", ["-fl", file], { encoding: "utf8" }).trim(); } catch { return ""; }
}

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
      expect(res.sidecarPath).toBe(sidecarPath(out));
      expect(res.sidecarPath).toMatch(/plain\.sidecar\.json$/);
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

  it("fails a page that stops responding within the timeout, without blocking other pages", async () => {
    const ws = tmpWorkspace("basic");
    await withRenderer(ws, async (r) => {
      const started = Date.now();
      let loopSettled = false;
      const loop = renderPage(r, { page: "loop", target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", "loop") })
        .then(() => "rendered", (e: Error) => ({ message: e.message, ms: Date.now() - started }))
        .finally(() => { loopSettled = true; });
      const plain = await renderPage(r, { page: "plain", target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", "plain") });
      // The other page finished while the stuck one was still waiting.
      expect(loopSettled).toBe(false);
      expect(plain.sidecar.page).toBe("plain");
      const failed = await loop;
      // The ready wait allows Playwright's own timeout (5 s) 2 s to fire first, so the real limit is 7 s.
      expect(failed).toMatchObject({ message: expect.stringMatching(/^loop \(android-phone, en\): page stopped responding after 7s/) });
      expect((failed as { ms: number }).ms).toBeLessThan(20000);
      // The renderer keeps working after closing a stuck page.
      const again = await renderPage(r, { page: "plain", target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", "plain") });
      expect(again.sidecar.page).toBe("plain");
    }, { timeoutMs: 5000 });
  });

  it("fails a video whose __seek never resolves and stops ffmpeg", async () => {
    const ws = tmpWorkspace("basic");
    const out = `${ws}/out/stuck-seek.mp4`;
    await withRenderer(ws, async (r) => {
      const started = Date.now();
      await expect(renderVideo(r, { page: "stuck-seek", target: "android-phone", locale: "en", out }, { fps: 2, duration: 1 }))
        .rejects.toThrow(/stuck-seek \(android-phone, en\): page stopped responding after 3s/);
      expect(Date.now() - started).toBeLessThan(15000);
      expect(processesFor(out)).toBe("");
    }, { timeoutMs: 3000 });
  });

  it("fails fast on a page with a malformed import map and names the page", async () => {
    const ws = tmpWorkspace("basic");
    await withRenderer(ws, async (r) => {
      const started = Date.now();
      await expect(renderPage(r, { page: "bad-map", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "bad-map") }))
        .rejects.toThrow(/bad-map \(iphone-6\.9, en\): bad-map\.html: .*JSON/);
      expect(Date.now() - started).toBeLessThan(20000);
    });
  });

  it("says how to install three when a page imports it without it", async () => {
    const ws = tmpWorkspace("basic");
    fs.rmSync(`${ws}/node_modules`);
    await withRenderer(ws, async (r) => {
      await expect(renderPage(r, { page: "no-three", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "no-three") }))
        .rejects.toThrow(/Failed to resolve module specifier "three".* \(install three in the workspace: npm install three\)/);
    });
  });

  it("writes the sidecar as <name>.sidecar.json and leaves files outside out/ alone", async () => {
    const ws = tmpWorkspace("basic");
    fs.writeFileSync(`${ws}/claims.json`, '{ "keep": "me" }\n');
    const before = fs.readFileSync(`${ws}/claims.json`);
    const r = execFileSync("node", [`${ROOT}/dist/cli.js`, "render", "plain", "-C", ws, "-o", `${ws}/claims.png`, "--json"], { encoding: "utf8" });
    expect(JSON.parse(r)).toMatchObject({ ok: true, out: `${ws}/claims.png`, sidecar: `${ws}/claims.sidecar.json` });
    expect(fs.readFileSync(`${ws}/claims.json`).equals(before)).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${ws}/claims.sidecar.json`, "utf8")).page).toBe("plain");
    // A failed render to a path outside out/ deletes nothing beforehand.
    fs.writeFileSync(`${ws}/keep.png`, "keep");
    fs.writeFileSync(`${ws}/keep.sidecar.json`, "keep");
    await withRenderer(ws, async (rr) => {
      await expect(renderPage(rr, { page: "broken", target: "iphone-6.9", locale: "en", out: `${ws}/keep.png` })).rejects.toThrow(/boom/);
    });
    expect(fs.readFileSync(`${ws}/keep.png`, "utf8")).toBe("keep");
    expect(fs.readFileSync(`${ws}/keep.sidecar.json`, "utf8")).toBe("keep");
  });

  it("marks a page whose DOM changes after ready()", async () => {
    const ws = tmpWorkspace("basic");
    const { sidecar } = await withRenderer(ws, (r) => renderPage(r, { page: "late-text", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "late-text") }));
    expect(sidecar.kit).toBe(true);
    expect(sidecar.changedAfterReady).toBe(true);
    // A style or class change after ready() is not a text change.
    fs.writeFileSync(`${ws}/pages/late-style.html`, `<!doctype html><body><script type="module">
      import { stage, ready } from "shotsmith/kit";
      const s = await stage();
      const p = document.createElement("p");
      p.textContent = "Same words";
      s.root.append(p);
      await ready();
      p.style.color = "red";
      p.className = "late";</script></body></html>`);
    const styled = await withRenderer(ws, (r) => renderPage(r, { page: "late-style", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "late-style") }));
    expect(styled.sidecar.kit).toBe(true);
    expect(styled.sidecar.changedAfterReady).toBe(false);
    const kit = tmpWorkspace("kit");
    const texts = await withRenderer(kit, (r) => renderPage(r, { page: "texts", target: "iphone-6.9", locale: "en", out: outPath(r.cfg, "en", "iphone-6.9", "texts") }));
    expect(texts.sidecar.changedAfterReady).toBe(false);
    expect(texts.sidecar.requests.fonts).toEqual(expect.arrayContaining(["/fonts/Inter-Bold.ttf", "/fonts/Inter-Regular.ttf"]));
  });

  it("records captures the page requests, from any platform", async () => {
    const ws = tmpWorkspace("basic");
    fs.mkdirSync(`${ws}/inputs/iphone/en`, { recursive: true });
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "#00f" } }).png().toFile(`${ws}/inputs/iphone/en/home.png`);
    const { sidecar } = await withRenderer(ws, (r) => renderPage(r, { page: "cross-capture", target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", "cross-capture") }));
    expect(sidecar.requests.captures).toEqual(["/inputs/iphone/en/home.png"]);
    expect(sidecar.changedAfterReady).toBe(false);
  });

  it("records a capture however its URL is spelled", async () => {
    const ws = tmpWorkspace("basic");
    fs.mkdirSync(`${ws}/inputs/iphone/en`, { recursive: true });
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "#00f" } }).png().toFile(`${ws}/inputs/iphone/en/home.png`);
    const variants: Record<string, string> = {
      encoded: `"/pages/..%2Finputs/iphone/en/home.png"`,
      dotdot: `"/pages/../inputs/iphone/en/home.png"`,
      localhost: `"http://localhost:" + location.port + "/inputs/iphone/en/home.png"`,
    };
    // Only case-insensitive file systems (macOS by default) serve a differently cased path.
    const caseInsensitive = fs.existsSync(`${ws}/INPUTS/iphone/en/home.png`);
    if (caseInsensitive) variants.cased = `"/Inputs/IPhone/en/Home.PNG"`;
    for (const [name, src] of Object.entries(variants)) {
      fs.writeFileSync(`${ws}/pages/${name}.html`, `<!doctype html><body><script>
        const img = new Image();
        img.onload = () => { window.__ready = true; };
        img.onerror = () => { window.__shotsmithError = "capture did not load: " + img.src; };
        img.src = ${src};</script></body></html>`);
    }
    await withRenderer(ws, async (r) => {
      for (const name of Object.keys(variants)) {
        const { sidecar } = await renderPage(r, { page: name, target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", name) });
        expect(sidecar.requests.captures, name).toEqual(["/inputs/iphone/en/home.png"]);
      }
    });
  });

  it("records a capture reached through a symlink into inputs", async () => {
    const ws = tmpWorkspace("basic");
    fs.mkdirSync(`${ws}/inputs/iphone/en`, { recursive: true });
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "#00f" } }).png().toFile(`${ws}/inputs/iphone/en/home.png`);
    fs.symlinkSync("../inputs/iphone", `${ws}/pages/cap`, "dir");
    fs.writeFileSync(`${ws}/pages/linked.html`, `<!doctype html><body><script>
      const img = new Image();
      img.onload = () => { window.__ready = true; };
      img.onerror = () => { window.__shotsmithError = "capture did not load"; };
      img.src = "/pages/cap/en/home.png";</script></body></html>`);
    const { sidecar } = await withRenderer(ws, (r) => renderPage(r, { page: "linked", target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", "linked") }));
    expect(sidecar.requests.captures).toEqual(["/inputs/iphone/en/home.png"]);
  });

  it("renders from the CLI", () => {
    const ws = tmpWorkspace("basic");
    execFileSync("node", [`${ROOT}/dist/cli.js`, "render", "plain", "-C", ws, "-t", "iphone-6.9"], { encoding: "utf8" });
    expect(fs.existsSync(`${ws}/out/en/iphone-6.9/plain.png`)).toBe(true);
  });
});
