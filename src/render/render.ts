import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type Browser, type Page, errors } from "playwright";
import { loadClaims } from "../config/claims.js";
import { type ResolvedConfig, loadConfig } from "../config/schema.js";
import { kitDir } from "../shared/paths.js";
import type { KitContext } from "../shared/context.js";
import { type KitSidecar, type Sidecar, domHash, emptySidecar, sidecarPath } from "../shared/sidecar.js";
import { launch } from "./browser.js";
import { buildContext } from "./context.js";
import { type GlyphCache, fontFileForUrl, openGlyphSources } from "./fonts.js";
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
  let browser: Browser;
  try {
    browser = await launch();
  } catch (e) {
    await server.close();
    throw e;
  }
  return {
    cfg, browser, server, timeoutMs: opts.timeoutMs ?? 90000,
    close: async () => { try { await browser.close(); } finally { await server.close(); } },
  };
}

const inside = (dir: string, p: string) => path.resolve(p).startsWith(path.resolve(dir) + path.sep);

// Thrown by bounded() when a browser call does not settle within the renderer timeout.
class PageStuck extends Error {}

// Resolves true if p settles within ms, false otherwise.
async function settlesWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<false>((res) => { timer = setTimeout(() => res(false), ms); });
  try { return await Promise.race([p.then(() => true, () => true), late]); } finally { clearTimeout(timer); }
}

// Every call into the page is raced against the renderer timeout: a page stuck in a loop never answers.
async function bounded<T>(r: Renderer, p: Promise<T>, ms = r.timeoutMs): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new PageStuck()), ms); });
  try { return await Promise.race([p, late]); } finally { clearTimeout(timer); }
}

// Closing a page whose script never yields can hang; closing its context (each page has its own) does not.
async function closeTab(tab: Page): Promise<void> {
  if (await settlesWithin(tab.close({ runBeforeUnload: false }), 5000)) return;
  await settlesWithin(tab.context().close(), 5000);
}

function renderFailure(r: Renderer, e: unknown, label: string, logs: string[]): unknown {
  if (e instanceof PageStuck) return new RenderError(`${label}: page stopped responding after ${r.timeoutMs / 1000}s`, logs);
  return e;
}

const THREE_HINT = " (install three in the workspace: npm install three)";
const withHint = (message: string) => (message.includes('Failed to resolve module specifier "three') ? message + THREE_HINT : message);

function targetOf(r: Renderer, name: string) {
  const t = r.cfg.targets.find((x) => x.name === name);
  if (!t) throw new Error(`Unknown target "${name}"`);
  return t;
}

interface OpenedPage { tab: Page; pageError: Promise<Error>; requests: Sidecar["requests"] }

function recordRequest(requests: Sidecar["requests"], origin: string, url: string, font: boolean): void {
  let where = url;
  try {
    const u = new URL(url);
    if (u.origin === origin) where = decodeURIComponent(u.pathname);
  } catch { /* keep the raw URL */ }
  if (where.startsWith("/inputs/") && !requests.captures.includes(where)) requests.captures.push(where);
  if (font && !requests.fonts.includes(where)) requests.fonts.push(where);
}

async function openPage(r: Renderer, job: RenderJob, label: string, logs: string[]): Promise<OpenedPage> {
  const t = targetOf(r, job.target);
  if (!/^[\w-]+$/.test(job.page)) throw new Error(`Page name "${job.page}" must use letters, digits, - and _ only`);
  // browser.newPage gives every page its own context, so closing a stuck one leaves the other workers alone.
  const tab = await r.browser.newPage({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 1 });
  let onError: (e: Error) => void = () => {};
  const pageError = new Promise<Error>((res) => { onError = res; });
  const requests: Sidecar["requests"] = { captures: [], fonts: [] };
  tab.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  tab.on("pageerror", (e) => { logs.push(`[pageerror] ${e.message}`); onError(e); });
  tab.on("request", (req) => recordRequest(requests, r.server.url, req.url(), req.resourceType() === "font"));
  const q = `t=${encodeURIComponent(job.target)}&l=${encodeURIComponent(job.locale)}`;
  try {
    const res = await tab.goto(`${r.server.url}/pages/${job.page}.html?${q}`, { waitUntil: "load", timeout: r.timeoutMs }).catch((e) => {
      if (e instanceof errors.TimeoutError) throw new RenderError(`${label}: page did not load within ${r.timeoutMs / 1000}s`, logs);
      throw e;
    });
    if (res?.status() === 404) throw new RenderError(`pages/${job.page}.html not found`, logs);
    if (res && !res.ok()) {
      // The server answers a page it cannot serve (a malformed import map, an unreadable file) with { error }.
      const body = await res.json().catch(() => null) as { error?: unknown } | null;
      throw new RenderError(`${label}: ${typeof body?.error === "string" ? body.error : `pages/${job.page}.html returned HTTP ${res.status()}`}`, logs);
    }
  } catch (e) {
    await closeTab(tab);
    throw e;
  }
  return { tab, pageError, requests };
}

// Waits for the page's signal. An uncaught page error before it fails the render at once: a module that fails to
// link (a missing export, a syntax error) never runs, so the kit cannot report it through window.__shotsmithError.
async function waitForPage(r: Renderer, page: OpenedPage, signal: () => boolean, missing: string, label: string, logs: string[]): Promise<void> {
  const outcome = await Promise.race([
    // Only Playwright's own timeout means the page never signalled; a closed or crashed page reports its own error.
    // Playwright's timeout needs a page that still runs, so a page stuck in a loop is caught by bounded() shortly after.
    bounded(r, page.tab.waitForFunction(signal, null, { timeout: r.timeoutMs }), r.timeoutMs + 2000)
      .then(() => "ok" as const, (e: Error) => {
        if (e instanceof PageStuck) throw e;
        return e instanceof errors.TimeoutError ? "timeout" as const : e;
      }),
    page.pageError,
  ]);
  const kitError = await bounded(r, page.tab.evaluate(() => (window as any).__shotsmithError as string | undefined)).catch((e) => {
    if (e instanceof PageStuck) throw e;
    return undefined;
  });
  if (kitError) throw new RenderError(withHint(`${label}: ${kitError}`), logs);
  if (outcome instanceof Error) throw new RenderError(withHint(`${label}: ${outcome.message}`), logs);
  if (outcome === "timeout") throw new RenderError(`${label} did not ${missing} within ${r.timeoutMs / 1000}s`, logs);
}

// Characters that never need a glyph of their own.
const NO_GLYPH = /[\s\p{Cc}\p{Default_Ignorable_Code_Point}]/u;

const firstFamily = (fontFamily: string): string => (fontFamily.split(",")[0] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");

// Marks texts that are not fully drawn by the configured font: glyphs that came from a system font (reported by
// Chromium), and code points no face of the configured family has a glyph for. When no installed font has the glyph
// either, Chromium draws the web font's .notdef box and reports only the web font, so the second check is needed.
async function applyCoverage(tab: Page, sidecar: Sidecar, fonts: KitContext["fonts"], root: string, cache: GlyphCache): Promise<void> {
  if (!sidecar.texts.length) return;
  const cdp = await tab.context().newCDPSession(tab);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root: doc } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: doc.nodeId, selector: "[data-sx]" });
  for (const nodeId of nodeIds) {
    const { attributes } = await cdp.send("DOM.getAttributes", { nodeId });
    const el = Number(attributes[attributes.indexOf("data-sx") + 1]);
    const { fonts: used } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const system = used.filter((f) => !f.isCustomFont).map((f) => f.familyName);
    for (const t of sidecar.texts) if (t.el === el) { t.covered = system.length === 0; t.fallbackFonts = system; }
  }
  await cdp.detach();

  for (const t of sidecar.texts) {
    const family = Object.values(fonts).find((f) => f.family === firstFamily(t.font));
    if (!family) continue;
    const sources = family.faces.flatMap((face) => {
      const file = fontFileForUrl(root, face.url);
      return file ? openGlyphSources(file, cache) : [];
    });
    if (!sources.length) continue;
    const missing = new Set<string>();
    for (const ch of t.text) {
      if (NO_GLYPH.test(ch)) continue;
      const cp = ch.codePointAt(0)!;
      if (!sources.some((f) => f.hasGlyphForCodePoint(cp))) missing.add(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
    }
    t.missingGlyphs = [...missing];
    if (missing.size) t.covered = false;
  }
}

export async function renderPage(r: Renderer, job: RenderJob): Promise<RenderResult> {
  const t = targetOf(r, job.target);
  if (!r.cfg.locales.some((l) => l.code === job.locale)) throw new Error(`Unknown locale "${job.locale}"`);
  // The sidecar is written next to the image as <name>.sidecar.json, so the image must be a .png.
  if (!/\.png$/.test(job.out)) throw new Error(`Render output must be a .png file, got ${job.out}`);
  const sidecarFile = sidecarPath(job.out);
  // A failed render must not leave the previous image and sidecar behind for check to pass on. Only Shotsmith's own
  // out/ is cleared up front; an explicit -o file elsewhere is only ever overwritten by a finished render.
  if (inside(path.join(r.cfg.root, "out"), job.out)) {
    fs.rmSync(job.out, { force: true });
    fs.rmSync(sidecarFile, { force: true });
  }
  const logs: string[] = [];
  const started = Date.now();
  const label = `${job.page} (${job.target}, ${job.locale})`;
  const opened = await openPage(r, job, label, logs);
  const tab = opened.tab;
  try {
    await waitForPage(r, opened, () => (window as any).__ready === true || typeof (window as any).__shotsmithError === "string", "set window.__ready", label, logs);
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    await bounded(r, tab.screenshot({ path: job.out, clip: { x: 0, y: 0, width: t.w, height: t.h } }));
    const [raw, html, readyHash] = await bounded(r, tab.evaluate(() => [
      (window as any).__shotsmithSidecar ?? null, document.body?.innerHTML ?? "", (window as any).__shotsmithDomHash ?? null,
    ] as const)) as [KitSidecar | null, string, string | null];
    const sidecar: Sidecar = raw
      ? { ...raw, page: job.page, target: job.target, locale: job.locale, kit: true, requests: opened.requests, changedAfterReady: readyHash !== null && readyHash !== domHash(html) }
      : { ...emptySidecar(job.page, job.target, job.locale, "kit.unused: page did not use the kit; its text and fonts were not checked"), requests: opened.requests };
    if (sidecar.texts.length) {
      const c = buildContext(loadConfig(r.cfg.root), loadClaims(r.cfg.root), job.target, job.locale, job.page);
      await bounded(r, applyCoverage(tab, sidecar, c.fonts, r.cfg.root, new Map()));
    }
    fs.writeFileSync(sidecarFile, JSON.stringify(sidecar, null, 2) + "\n");
    return { ...job, sidecar, sidecarPath: sidecarFile, logs, ms: Date.now() - started };
  } catch (e) {
    throw renderFailure(r, e, label, logs);
  } finally {
    await closeTab(tab);
  }
}

// Video contract: the page defines window.__seek = async (seconds) => { ...draw that moment... }.
export async function renderVideo(r: Renderer, job: RenderJob, opts: { fps: number; duration: number }): Promise<void> {
  const t = targetOf(r, job.target);
  const logs: string[] = [];
  const label = `${job.page} (${job.target}, ${job.locale})`;
  const opened = await openPage(r, job, label, logs);
  const tab = opened.tab;
  let ff: ChildProcessWithoutNullStreams | null = null;
  let done: Promise<number> = Promise.resolve(0);
  let exited = false;
  try {
    await waitForPage(r, opened, () => typeof (window as any).__seek === "function" || typeof (window as any).__shotsmithError === "string", "define window.__seek", label, logs);
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    const proc = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(opts.fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", job.out]);
    ff = proc;
    let failure: RenderError | null = null;
    let stderr = "";
    proc.stdout.resume();
    proc.stderr.on("data", (d) => { stderr = (stderr + String(d)).slice(-2000); });
    done = new Promise<number>((res) => {
      proc.on("error", (e) => { failure = new RenderError(`ffmpeg is not installed or failed to start: ${e.message}`, logs); exited = true; res(1); });
      proc.on("close", (code) => { exited = true; res(code ?? 1); });
    });
    // A dead ffmpeg closes the pipe; the exit code reports it, so the write error itself is ignored.
    proc.stdin.on("error", () => {});
    for (let f = 0; f < Math.round(opts.fps * opts.duration) && !exited; f++) {
      await bounded(r, tab.evaluate((s) => (window as any).__seek(s), f / opts.fps));
      const frame = await bounded(r, tab.screenshot({ type: "png", clip: { x: 0, y: 0, width: t.w, height: t.h } }));
      if (exited) break;
      if (!proc.stdin.write(frame)) {
        await Promise.race([done, new Promise<void>((res) => { proc.stdin.once("drain", () => res()); proc.stdin.once("close", () => res()); })]);
      }
    }
    if (!exited) proc.stdin.end();
    const code = await done;
    if (failure) throw failure;
    if (code !== 0) throw new RenderError(`ffmpeg failed (exit ${code})${stderr.trim() ? `: ${stderr.trim().split("\n").slice(-3).join(" ")}` : ""}`, logs);
  } catch (e) {
    // Stop ffmpeg on every failure: close its input, then kill it if it has not exited within 2 s.
    if (ff && !exited) {
      ff.stdin.destroy();
      if (!(await settlesWithin(done, 2000))) ff.kill("SIGKILL");
      await done;
    }
    throw renderFailure(r, e, label, logs);
  } finally {
    await closeTab(tab);
  }
}
