import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { loadClaims } from "../config/claims.js";
import { type ResolvedConfig, loadConfig } from "../config/schema.js";
import { kitDir } from "../shared/paths.js";
import { type Sidecar, emptySidecar } from "../shared/sidecar.js";
import { launch } from "./browser.js";
import { buildContext } from "./context.js";
import { type RenderServer, startServer } from "./server.js";

export interface Renderer { cfg: ResolvedConfig; browser: Browser; server: RenderServer; timeoutMs: number; close(): Promise<void> }
export interface RenderJob { page: string; target: string; locale: string; out: string }
export interface RenderResult extends RenderJob { sidecar: Sidecar; sidecarPath: string; logs: string[]; ms: number }

export class RenderError extends Error {
  constructor(message: string, public logs: string[]) { super(logs.length ? `${message}\n${logs.slice(-20).join("\n")}` : message); }
}

export const outPath = (cfg: ResolvedConfig, locale: string, target: string, page: string): string =>
  path.join(cfg.root, "out", locale, target, `${page}.png`);

export async function openRenderer(cfg: ResolvedConfig, opts: { timeoutMs?: number } = {}): Promise<Renderer> {
  const server = await startServer({
    root: cfg.root,
    kitDir: kitDir(),
    // Re-read config and claims per request so edits show up without restarting.
    context: (t, l, p) => buildContext(loadConfig(cfg.root), loadClaims(cfg.root), t, l, p),
  });
  const browser = await launch();
  return { cfg, browser, server, timeoutMs: opts.timeoutMs ?? 90000, close: async () => { await browser.close(); await server.close(); } };
}

function targetOf(r: Renderer, name: string) {
  const t = r.cfg.targets.find((x) => x.name === name);
  if (!t) throw new Error(`Unknown target "${name}"`);
  return t;
}

async function openPage(r: Renderer, job: RenderJob, logs: string[]): Promise<Page> {
  const t = targetOf(r, job.target);
  const tab = await r.browser.newPage({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 1 });
  tab.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  tab.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  const q = `t=${encodeURIComponent(job.target)}&l=${encodeURIComponent(job.locale)}`;
  await tab.goto(`${r.server.url}/pages/${job.page}.html?${q}`, { waitUntil: "load" });
  return tab;
}

// Marks texts whose glyphs came from a system font rather than a loaded web font.
async function applyCoverage(tab: Page, sidecar: Sidecar): Promise<void> {
  if (!sidecar.texts.length) return;
  const cdp = await tab.context().newCDPSession(tab);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-sx]" });
  for (const nodeId of nodeIds) {
    const { attributes } = await cdp.send("DOM.getAttributes", { nodeId });
    const el = Number(attributes[attributes.indexOf("data-sx") + 1]);
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const system = fonts.filter((f) => !f.isCustomFont).map((f) => f.familyName);
    for (const t of sidecar.texts) if (t.el === el) { t.covered = system.length === 0; t.fallbackFonts = system; }
  }
  await cdp.detach();
}

export async function renderPage(r: Renderer, job: RenderJob): Promise<RenderResult> {
  const t = targetOf(r, job.target);
  const logs: string[] = [];
  const started = Date.now();
  const tab = await openPage(r, job, logs);
  const label = `${job.page} (${job.target}, ${job.locale})`;
  try {
    try {
      await tab.waitForFunction(() => (window as any).__ready === true || typeof (window as any).__shotsmithError === "string", null, { timeout: r.timeoutMs });
    } catch {
      throw new RenderError(`${label} did not set window.__ready within ${r.timeoutMs / 1000}s`, logs);
    }
    const error = await tab.evaluate(() => (window as any).__shotsmithError as string | undefined);
    if (error) throw new RenderError(`${label}: ${error}`, logs);
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    await tab.screenshot({ path: job.out, clip: { x: 0, y: 0, width: t.w, height: t.h } });
    const raw = (await tab.evaluate(() => (window as any).__shotsmithSidecar ?? null)) as Sidecar | null;
    const sidecar: Sidecar = raw
      ? { ...raw, page: job.page, target: job.target, locale: job.locale, kit: true }
      : emptySidecar(job.page, job.target, job.locale, "kit.unused: page did not use the kit; its text and fonts were not checked");
    await applyCoverage(tab, sidecar);
    const sidecarPath = job.out.replace(/\.png$/, ".json");
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
    return { ...job, sidecar, sidecarPath, logs, ms: Date.now() - started };
  } finally {
    await tab.close();
  }
}

// Video contract: the page defines window.__seek = async (seconds) => { ...draw that moment... }.
export async function renderVideo(r: Renderer, job: RenderJob, opts: { fps: number; duration: number }): Promise<void> {
  const t = targetOf(r, job.target);
  const logs: string[] = [];
  const tab = await openPage(r, job, logs);
  try {
    await tab.waitForFunction(() => typeof (window as any).__seek === "function", null, { timeout: r.timeoutMs });
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(opts.fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", job.out], { stdio: ["pipe", "ignore", "inherit"] });
    const done = new Promise<number>((res, rej) => { ff.on("close", (code) => res(code ?? 1)); ff.on("error", rej); });
    for (let f = 0; f < Math.round(opts.fps * opts.duration); f++) {
      await tab.evaluate((s) => (window as any).__seek(s), f / opts.fps);
      ff.stdin.write(await tab.screenshot({ type: "png", clip: { x: 0, y: 0, width: t.w, height: t.h } }));
    }
    ff.stdin.end();
    if ((await done) !== 0) throw new RenderError("ffmpeg failed; is it installed?", logs);
  } finally {
    await tab.close();
  }
}
