import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { type Page, errors } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chromiumArgs } from "../src/render/browser.js";
import { outPath, renderFailure, renderPage, renderVideo, waitForPage } from "../src/render/render.js";
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
      expect(JSON.parse(fs.readFileSync(res.sidecarPath!, "utf8")).page).toBe("plain");
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
      let stuckSettled = 0;
      // loop starts looping 300 ms after its script runs, normally after Playwright's ready poller is in the page;
      // loop-early starts as soon as it has loaded, before the poller is in. Both must fail the same way.
      const stuck = ["loop", "loop-early"].map((page) => renderPage(r, { page, target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", page) })
        .then(() => "rendered", (e: Error) => ({ message: e.message, ms: Date.now() - started }))
        .finally(() => { stuckSettled++; }));
      const plain = await renderPage(r, { page: "plain", target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", "plain") });
      // The other page finished while the stuck ones were still waiting.
      expect(stuckSettled).toBe(0);
      expect(plain.sidecar.page).toBe("plain");
      const [loop, early] = await Promise.all(stuck);
      expect(loop).toMatchObject({ message: expect.stringMatching(/^loop \(android-phone, en\): page stopped responding \(no answer within 5s\)/) });
      expect(early).toMatchObject({ message: expect.stringMatching(/^loop-early \(android-phone, en\): page stopped responding \(no answer within 5s\)/) });
      for (const f of [loop, early]) expect((f as { ms: number }).ms).toBeLessThan(20000);
      // The renderer keeps working after closing a stuck page.
      const again = await renderPage(r, { page: "plain", target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", "plain") });
      expect(again.sidecar.page).toBe("plain");
    }, { timeoutMs: 5000 });
  });

  it("fails a video page that sets __ready without __seek at once, not after the timeout", async () => {
    const ws = tmpWorkspace("basic");
    await withRenderer(ws, async (r) => {
      const started = Date.now();
      await expect(renderVideo(r, { page: "plain", target: "android-phone", locale: "en", out: `${ws}/out/plain.mp4` }, { fps: 2, duration: 1 }))
        .rejects.toThrow(/plain \(android-phone, en\) set window\.__ready but does not define window\.__seek/);
      expect(Date.now() - started).toBeLessThan(20000);
      expect(fs.existsSync(`${ws}/out/plain.mp4`)).toBe(false);
    }, { timeoutMs: 60000 });
  });

  it("fails a video whose __seek never resolves and stops ffmpeg", async () => {
    const ws = tmpWorkspace("basic");
    const out = `${ws}/out/stuck-seek.mp4`;
    await withRenderer(ws, async (r) => {
      const started = Date.now();
      await expect(renderVideo(r, { page: "stuck-seek", target: "android-phone", locale: "en", out }, { fps: 2, duration: 1 }))
        .rejects.toThrow(/stuck-seek \(android-phone, en\): page stopped responding \(no answer within 3s\)/);
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
      p.className = "late";
      // Source text that is never shown is not page text either.
      const st = document.createElement("style");
      st.textContent = ".late { letter-spacing: 1px }";
      document.head.append(st);
      s.root.append(Object.assign(document.createElement("style"), { textContent: "p { margin: 0 }" }));
      s.root.append(Object.assign(document.createElement("template"), { innerHTML: "<p>Later</p>" }));
      const ns = document.createElement("noscript");
      ns.textContent = "No script";
      s.root.append(ns);
      const sc = document.createElement("script");
      sc.type = "text/plain";
      sc.textContent = "notes";
      s.root.append(sc);</script></body></html>`);
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

  it("identifies a served font by the names inside it, however its URL is spelled or fetched", async () => {
    const ws = tmpWorkspace("kit");
    const load = (src: string) => `new FontFace("F", "url(" + ${src} + ")").load()`;
    const variants: Record<string, string> = {
      encoded: load(`"/pages/..%2Ffonts/Inter-Bold.ttf"`),
      dotdot: load(`"/pages/../fonts/Inter-Bold.ttf"`),
      localhost: load(`"http://localhost:" + location.port + "/fonts/Inter-Bold.ttf"`),
      fetched: `fetch("/fonts/Inter-Bold.ttf").then((r) => r.arrayBuffer()).then((b) => new FontFace("F", b).load())`,
    };
    if (fs.existsSync(`${ws}/FONTS/Inter-Bold.ttf`)) variants.cased = load(`"/Fonts/INTER-bold.ttf"`);
    for (const [name, js] of Object.entries(variants)) {
      fs.writeFileSync(`${ws}/pages/${name}.html`, `<!doctype html><body><script>${js}.catch(() => {}).finally(() => { window.__ready = true; });</script></body></html>`);
    }
    await withRenderer(ws, async (r) => {
      for (const name of Object.keys(variants)) {
        const { sidecar } = await renderPage(r, { page: name, target: "android-phone", locale: "en", out: outPath(r.cfg, "en", "android-phone", name) });
        expect(sidecar.requests.fonts, name).toEqual(["/fonts/Inter-Bold.ttf"]);
        expect(sidecar.servedFonts, name).toEqual([{ url: "/fonts/Inter-Bold.ttf", names: ["Inter", "Inter Bold", "Inter-Bold"], appleOnly: false }]);
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

// waitForPage against a stand-in page that never answers an evaluate, as a page stuck in a loop does not.
describe("stuck page", () => {
  const never = () => new Promise<never>(() => {});
  const TIMEOUT = 300;
  const GRACE = 2000;
  afterEach(() => { vi.useRealTimers(); });

  // Runs waitForPage on fake timers and reports whether it had failed just before and exactly at timeout + grace.
  const stuckFailure = async (waitForFunction: () => Promise<unknown>) => {
    vi.useFakeTimers();
    const r = { timeoutMs: TIMEOUT };
    const tab = { waitForFunction, evaluate: never } as unknown as Page;
    let failure: unknown = null;
    let settled = false;
    const run = waitForPage(r, { tab, pageError: never() }, () => true, "set window.__ready", "p (t, en)", []).then(() => null, (x: unknown) => x).then((x) => { failure = x; settled = true; });
    await vi.advanceTimersByTimeAsync(TIMEOUT + GRACE - 1);
    const settledBefore = settled;
    await vi.advanceTimersByTimeAsync(1);
    await run;
    return { message: (renderFailure(r, failure, "p (t, en)", []) as Error).message, settledBefore, settledAt: settled };
  };

  it("reports the renderer timeout whichever step finds the page stuck", async () => {
    // The loop started after Playwright's poller was in the page: Playwright's timeout waits on the page and never settles.
    const late = await stuckFailure(never);
    // The loop started before the poller was in the page: Playwright's timeout fires, then the page does not answer.
    const early = await stuckFailure(() => new Promise((_, rej) => setTimeout(() => rej(new errors.TimeoutError(`Timeout ${TIMEOUT}ms exceeded`)), TIMEOUT)));
    for (const f of [late, early]) {
      expect(f.message).toBe("p (t, en): page stopped responding (no answer within 0.3s)");
      // Both fail exactly the grace after the timeout (not before it, and not after a second full timeout).
      expect(f.settledBefore).toBe(false);
      expect(f.settledAt).toBe(true);
    }
  });

  it("still reports a page that runs but never signals as not ready", async () => {
    const r = { timeoutMs: 300 };
    const tab = {
      waitForFunction: () => new Promise((_, rej) => setTimeout(() => rej(new errors.TimeoutError("Timeout 300ms exceeded")), 300)),
      evaluate: async () => undefined,
    } as unknown as Page;
    await expect(waitForPage(r, { tab, pageError: never() }, () => true, "set window.__ready", "p (t, en)", [])).rejects.toThrow(/^p \(t, en\) did not set window\.__ready within 0\.3s$/);
  });
});
