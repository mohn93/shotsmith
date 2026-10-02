import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import { type Browser, type Page, errors } from "playwright";
import { refuseLinked } from "../checks/store.js";
import { loadClaims } from "../config/claims.js";
import { type ResolvedConfig, loadConfig } from "../config/schema.js";
import { isAppleOnlyFontName } from "../config/targets.js";
import { kitDir } from "../shared/paths.js";
import type { KitContext } from "../shared/context.js";
import { installPatches } from "../shared/patches.js";
import { type KitSidecar, type Sidecar, type SidecarGenerated, type SidecarServedFont, domHash, emptySidecar, pageText, sidecarPath } from "../shared/sidecar.js";
import { launch } from "./browser.js";
import { buildContext } from "./context.js";
import { type GlyphCache, findSysFont, fontFileForUrl, openGlyphSources } from "./fonts.js";
import { type RenderServer, resolveInside, startServer } from "./server.js";

export interface Renderer { cfg: ResolvedConfig; browser: Browser; server: RenderServer; timeoutMs: number; close(): Promise<void> }
export interface RenderJob { page: string; target: string; locale: string; out: string }
// sidecarPath is null when the image was written outside the workspace (an explicit -o): only that image is written,
// and sidecarSkipped says why.
export interface RenderResult extends RenderJob { sidecar: Sidecar; sidecarPath: string | null; sidecarSkipped?: string; logs: string[]; ms: number }

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

// Thrown by bounded() when a browser call does not settle in time. Every limit is derived from the renderer timeout,
// so the failure reports that timeout whichever step stopped answering.
class PageStuck extends Error {
  constructor(ms: number) { super(`no answer within ${ms} ms`); }
}

// After Playwright's own timeout fires, a page that still runs answers at once; one that does not within this long
// is stuck in a loop.
const STUCK_GRACE_MS = 2000;

// Resolves true if p settles within ms, false otherwise.
async function settlesWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<false>((res) => { timer = setTimeout(() => res(false), ms); });
  try { return await Promise.race([p.then(() => true, () => true), late]); } finally { clearTimeout(timer); }
}

// Every call into the page is raced against the renderer timeout: a page stuck in a loop never answers.
async function bounded<T>(r: Pick<Renderer, "timeoutMs">, p: Promise<T>, ms = r.timeoutMs): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new PageStuck(ms)), ms); });
  try { return await Promise.race([p, late]); } finally { clearTimeout(timer); }
}

// Closing a page whose script never yields can hang; closing its context (each page has its own) does not.
async function closeTab(tab: Page): Promise<void> {
  if (await settlesWithin(tab.close({ runBeforeUnload: false }), 5000)) return;
  await settlesWithin(tab.context().close(), 5000);
}

export function renderFailure(r: Pick<Renderer, "timeoutMs">, e: unknown, label: string, logs: string[]): unknown {
  if (e instanceof PageStuck) return new RenderError(`${label}: page stopped responding (no answer within ${r.timeoutMs / 1000}s)`, logs);
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

// The render server answers on both host names (see server.ts).
const serverHosts = (serverUrl: string): Set<string> => {
  const { port } = new URL(serverUrl);
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
};

// Names each path segment under dir with its on-disk spelling (case-insensitive file systems accept any casing).
function diskCase(dir: string, segments: string[]): string[] {
  const out: string[] = [];
  for (const seg of segments) {
    let name = seg;
    try {
      const entries = fs.readdirSync(dir);
      if (!entries.includes(seg)) name = entries.find((e) => e.toLowerCase() === seg.toLowerCase()) ?? seg;
    } catch { /* not a directory, or missing: keep the requested spelling */ }
    out.push(name);
    dir = path.join(dir, name);
  }
  return out;
}

// Resolves a same-server request exactly as server.ts does, so /pages/..%2Finputs/x, /Inputs/x, a symlink into
// inputs/ and the localhost host name are all seen as the capture they load. Returns /inputs/<platform>/... or null.
function captureOf(root: string, pathname: string): string | null {
  if (pathname.startsWith("/__shotsmith/") || pathname.startsWith("/sysfont/")) return null;
  const file = path.resolve(root, "." + pathname);
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const canonical = (dir: string, segments: string[]) => `/inputs/${diskCase(dir, segments).join("/")}`;
  try {
    // The file exists: the real path decides, so a link from elsewhere in the workspace into inputs/ counts.
    const inputs = fs.realpathSync(path.join(root, "inputs")), real = fs.realpathSync(file);
    const within = path.relative(inputs, real);
    if (within && !within.startsWith("..") && !path.isAbsolute(within)) return canonical(inputs, within.split(path.sep));
  } catch { /* missing file or no inputs folder: fall back to the requested spelling */ }
  const [top, ...rest] = rel.split(path.sep);
  if (top.toLowerCase() !== "inputs" || !rest.length) return null;
  return canonical(path.join(root, diskCase(root, [top])[0]), rest);
}

const FONT_FILE = /\.(otf|ttf|ttc|woff2?)$/i;

// A same-server font request named as the server resolves it: /sysfont/<file>, or the workspace path with its on-disk
// spelling, so /pages/..%2Ffonts/x.ttf, /Fonts/x.ttf and the localhost host name all name /fonts/x.ttf.
function fontPathOf(root: string, pathname: string): string {
  if (pathname.startsWith("/sysfont/") || pathname.startsWith("/__shotsmith/")) return pathname;
  const rel = path.relative(root, path.resolve(root, "." + pathname));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return pathname;
  return "/" + diskCase(root, rel.split(path.sep)).join("/");
}

function recordRequest(requests: Sidecar["requests"], hosts: Set<string>, root: string, url: string, fontType: boolean): void {
  let where = url, capture: string | null = null, font = fontType;
  try {
    const u = new URL(url);
    if ((u.protocol === "http:") && hosts.has(u.host)) {
      const pathname = decodeURIComponent(u.pathname);
      capture = captureOf(root, pathname);
      // A font file fetched some other way (fetch() into new FontFace) is still a font.
      font ||= pathname.startsWith("/sysfont/") || FONT_FILE.test(pathname);
      where = font ? fontPathOf(root, pathname) : pathname;
    }
  } catch { /* keep the raw URL */ }
  if (capture && !requests.captures.includes(capture)) requests.captures.push(capture);
  if (font && !requests.fonts.includes(where)) requests.fonts.push(where);
}

// The file a recorded font request was served from, found the way server.ts finds it; null for other hosts.
function servedFontFile(root: string, url: string): string | null {
  if (!url.startsWith("/") || url.startsWith("/__shotsmith/")) return null;
  if (url.startsWith("/sysfont/")) return findSysFont(url.slice("/sysfont/".length));
  return resolveInside(root, "." + url);
}

// Family, full and PostScript names of every font in a file (a collection has several).
function fontNames(file: string): string[] {
  try {
    const f = fontkit.openSync(file);
    const names = ("fonts" in f ? f.fonts : [f]).flatMap((x) => [x.familyName, x.fullName, x.postscriptName]);
    return [...new Set(names.filter((n): n is string => typeof n === "string" && n !== ""))];
  } catch {
    return [];
  }
}

// Identifies every font the page requested by the names inside the file, whatever the file or URL is called.
function servedFonts(root: string, urls: string[]): SidecarServedFont[] {
  return urls.map((url) => {
    const file = servedFontFile(root, url);
    const names = file ? fontNames(file) : [];
    return { url, names, appleOnly: names.some(isAppleOnlyFontName) };
  });
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
  const hosts = serverHosts(r.server.url), root = path.resolve(r.cfg.root);
  tab.on("request", (req) => recordRequest(requests, hosts, root, req.url(), req.resourceType() === "font"));
  // Before any page script, in every frame: canvas text is recorded and shadow roots the page makes are open.
  await tab.addInitScript(installPatches);
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
// A page stuck in a loop fails STUCK_GRACE_MS after the timeout whichever moment the loop started.
export async function waitForPage(r: Pick<Renderer, "timeoutMs">, page: Pick<OpenedPage, "tab" | "pageError">, signal: () => boolean, missing: string, label: string, logs: string[]): Promise<void> {
  const outcome = await Promise.race([
    // Only Playwright's own timeout means the page never signalled; a closed or crashed page reports its own error.
    // When the loop starts after Playwright's poller is in the page, Playwright's timeout then waits on the stuck page
    // to remove the poller, so bounded() catches it STUCK_GRACE_MS later. When the loop starts before the poller is in
    // the page, Playwright's timeout does fire; the read of __shotsmithError below then finds the page stuck.
    bounded(r, page.tab.waitForFunction(signal, null, { timeout: r.timeoutMs }), r.timeoutMs + STUCK_GRACE_MS)
      .then(() => "ok" as const, (e: Error) => {
        if (e instanceof PageStuck) throw e;
        return e instanceof errors.TimeoutError ? "timeout" as const : e;
      }),
    page.pageError,
  ]);
  // After the timeout has passed, a page that still runs answers at once: allow it only the grace, not another timeout.
  const kitWait = outcome === "timeout" ? STUCK_GRACE_MS : r.timeoutMs;
  const kitError = await bounded(r, page.tab.evaluate(() => (window as any).__shotsmithError as string | undefined), kitWait).catch((e) => {
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
  // The kit also traces text in shadow roots, so search each of them as well as the document.
  const { root: doc } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const scopes: number[] = [];
  const visit = (n: typeof doc): void => {
    if (n === doc || (n.shadowRootType && n.shadowRootType !== "user-agent")) scopes.push(n.nodeId);
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) visit(c);
  };
  visit(doc);
  const nodeIds: number[] = [];
  for (const nodeId of scopes) nodeIds.push(...(await cdp.send("DOM.querySelectorAll", { nodeId, selector: "[data-sx]" })).nodeIds);
  for (const nodeId of nodeIds) {
    const { attributes } = await cdp.send("DOM.getAttributes", { nodeId });
    const el = Number(attributes[attributes.indexOf("data-sx") + 1]);
    const { fonts: used } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const system = used.filter((f) => !f.isCustomFont).map((f) => f.familyName);
    // Web fonts report the names inside the file, so an Apple-only font is seen however it was loaded (data: URL too).
    const names = [...new Set(used.flatMap((f) => [f.familyName, f.postScriptName ?? ""]).filter(Boolean))];
    for (const t of sidecar.texts) if (t.el === el) { t.covered = system.length === 0; t.fallbackFonts = system; t.usedFonts = names; }
  }
  await cdp.detach();

  const unreadable = (file: string, e: Error) => {
    const name = file.startsWith(root + path.sep) ? path.relative(root, file) : path.basename(file);
    sidecar.warnings.push(`font.unreadable: ${name} could not be read (${e.message.split("\n")[0]}), so its glyph coverage was not checked`);
  };
  for (const t of sidecar.texts) {
    const family = Object.values(fonts).find((f) => f.family === firstFamily(t.font));
    if (!family) continue;
    const sources = family.faces.flatMap((face) => {
      const file = fontFileForUrl(root, face.url);
      return file ? openGlyphSources(file, cache, unreadable) : [];
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

// Describes a closed shadow root's host; runs in the page with the host as this.
function describeClosedHost(this: Element): SidecarGenerated {
  const r = this.getBoundingClientRect();
  const name = `${this.localName}${this.id ? `#${this.id}` : ""}${this.classList.length ? `.${Array.from(this.classList).join(".")}` : ""}`;
  return { kind: "shadowClosed", text: `${name} has a closed shadow root`, box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
}

// A page cannot read a closed shadow root, but the DevTools protocol can: one entry per closed root that still exists
// (from markup, or a script that ran before the patches). Roots inside iframes are the iframe's own; it is reported whole.
async function closedShadowRoots(tab: Page): Promise<SidecarGenerated[]> {
  const cdp = await tab.context().newCDPSession(tab);
  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    const hosts: number[] = [];
    const visit = (n: typeof root): void => {
      for (const sr of n.shadowRoots ?? []) { if (sr.shadowRootType === "closed") hosts.push(n.backendNodeId); visit(sr); }
      for (const c of n.children ?? []) visit(c);
    };
    visit(root);
    const out: SidecarGenerated[] = [];
    for (const backendNodeId of hosts) {
      const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
      const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId!, functionDeclaration: describeClosedHost.toString(), returnByValue: true });
      out.push(result.value as SidecarGenerated);
    }
    return out;
  } finally {
    await cdp.detach();
  }
}

export async function renderPage(r: Renderer, job: RenderJob): Promise<RenderResult> {
  const t = targetOf(r, job.target);
  if (!r.cfg.locales.some((l) => l.code === job.locale)) throw new Error(`Unknown locale "${job.locale}"`);
  // The sidecar is written next to the image as <name>.sidecar.json, so the image must be a .png.
  if (!/\.png$/.test(job.out)) throw new Error(`Render output must be a .png file, got ${job.out}`);
  // Inside the workspace nothing is written or deleted through a link. An explicit -o file outside the workspace is
  // the only thing written there: its sidecar is not.
  const inWorkspace = inside(r.cfg.root, job.out);
  const sidecarFile = inWorkspace ? sidecarPath(job.out) : null;
  if (sidecarFile) { refuseLinked(r.cfg.root, job.out); refuseLinked(r.cfg.root, sidecarFile); }
  // A failed render must not leave the previous image and sidecar behind for check to pass on. Only Shotsmith's own
  // out/ is cleared up front; an explicit -o file elsewhere is only ever overwritten by a finished render.
  if (sidecarFile && inside(path.join(r.cfg.root, "out"), job.out)) {
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
    const png = await bounded(r, tab.screenshot({ type: "png", clip: { x: 0, y: 0, width: t.w, height: t.h } }));
    const [raw, readyHash] = await bounded(r, tab.evaluate(() => [
      (window as any).__shotsmithSidecar ?? null, (window as any).__shotsmithDomHash ?? null,
    ] as const)) as [KitSidecar | null, string | null];
    const text = await bounded(r, tab.evaluate(pageText));
    const sidecar: Sidecar = raw
      ? { ...raw, page: job.page, target: job.target, locale: job.locale, kit: true, requests: opened.requests, changedAfterReady: readyHash !== null && readyHash !== domHash(text), servedFonts: [] }
      : { ...emptySidecar(job.page, job.target, job.locale, "kit.unused: page did not use the kit; its text and fonts were not checked"), requests: opened.requests };
    sidecar.servedFonts = servedFonts(path.resolve(r.cfg.root), opened.requests.fonts);
    if (raw) sidecar.generated = [...sidecar.generated, ...await bounded(r, closedShadowRoots(tab))];
    if (sidecar.texts.length) {
      const c = buildContext(loadConfig(r.cfg.root), loadClaims(r.cfg.root), job.target, job.locale, job.page);
      await bounded(r, applyCoverage(tab, sidecar, c.fonts, r.cfg.root, new Map()));
    }
    // The image and its sidecar are written together, only once everything passed.
    fs.mkdirSync(path.dirname(job.out), { recursive: true });
    fs.writeFileSync(job.out, png);
    if (!sidecarFile) {
      const sidecarSkipped = `${job.out} is outside the workspace, so only the image was written; its sidecar was not (check and claims read renders in out/)`;
      return { ...job, sidecar, sidecarPath: null, sidecarSkipped, logs, ms: Date.now() - started };
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
  if (inside(r.cfg.root, job.out)) refuseLinked(r.cfg.root, job.out);
  const logs: string[] = [];
  const label = `${job.page} (${job.target}, ${job.locale})`;
  const opened = await openPage(r, job, label, logs);
  const tab = opened.tab;
  let ff: ChildProcessWithoutNullStreams | null = null;
  let done: Promise<number> = Promise.resolve(0);
  let exited = false;
  try {
    // A page that reaches ready() without __seek is not a video page: fail then instead of waiting the full timeout.
    await waitForPage(r, opened, () => typeof (window as any).__seek === "function" || (window as any).__ready === true || typeof (window as any).__shotsmithError === "string", "define window.__seek", label, logs);
    const hasSeek = () => typeof (window as any).__seek === "function";
    if (!(await bounded(r, tab.evaluate(hasSeek)))) {
      // Allow a page that defines __seek just after ready() a moment to do so.
      const late = await bounded(r, tab.waitForFunction(hasSeek, null, { timeout: 1000 })).then(() => true, (e) => { if (e instanceof PageStuck) throw e; return false; });
      if (!late) throw new RenderError(`${label} set window.__ready but does not define window.__seek; a video page must set window.__seek = async (seconds) => { ...draw that moment... }`, logs);
    }
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
