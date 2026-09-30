import type { KitContext } from "../shared/context.js";
import type { KitSidecar, SidecarDevice } from "../shared/sidecar.js";

declare global {
  interface Window { __ready?: boolean; __shotsmithError?: string; __shotsmithSidecar?: KitSidecar; __shotsmithDomHash?: string }
}

export const LOGICAL_WIDTH = 1260;

export const state = {
  ctx: null as KitContext | null,
  root: null as HTMLDivElement | null,
  W: LOGICAL_WIDTH,
  H: 0,
  scale: 1,
  warnings: [] as string[],
  pending: [] as Promise<unknown>[],
  captures: new Set<string>(),
  devices: [] as SidecarDevice[],
  lifts: 0,
};

export function ctx(): KitContext {
  if (!state.ctx) throw new Error("Call await stage() before using the kit");
  return state.ctx;
}

export function waitFor<T>(p: Promise<T>): Promise<T> {
  state.pending.push(p);
  return p;
}

export function fail(e: unknown): void {
  if (window.__shotsmithError) return;
  window.__shotsmithError = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
}

window.addEventListener("error", (e) => fail(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => fail(e.reason));

// Evidence the DOM cannot give ready() later: text drawn into canvases, and images drawn into them. Recorded by patching
// the prototypes when the kit loads.
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export const evidence = {
  canvasTexts: new Map<AnyCanvas, Set<string>>(),
  canvasImages: new Map<AnyCanvas, Set<string>>(),
};
const note = (m: Map<AnyCanvas, Set<string>>, canvas: AnyCanvas, v: string) => {
  const set = m.get(canvas) ?? new Set<string>();
  set.add(v);
  m.set(canvas, set);
};

// Canvases the kit is drawing on (the status bar in composeScreen, lift crops). Only registered while the kit draws,
// so text a page later draws on a canvas the kit handed out is still recorded.
const internalCanvases = new WeakSet<object>();
export function drawInternal<T>(canvas: AnyCanvas, draw: () => T): T {
  internalCanvases.add(canvas);
  try { return draw(); } finally { internalCanvases.delete(canvas); }
}

// Text drawn after ready() was never checked: make the renderer's after-ready comparison fail.
const drawnAfterReady = () => { if (window.__ready) window.__shotsmithDomHash = "canvas-text-after-ready"; };

function imageUrl(src: unknown): string | null {
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) return src.currentSrc || src.src || null;
  if (typeof SVGImageElement !== "undefined" && src instanceof SVGImageElement) return src.href.baseVal ? new URL(src.href.baseVal, document.baseURI).href : null;
  return null;
}

function patchCanvas(proto: object | undefined, text: string[], images: string[]): void {
  if (!proto) return;
  const p = proto as Record<string, unknown>;
  for (const name of text) {
    const orig = p[name] as ((this: { canvas: AnyCanvas }, ...a: unknown[]) => unknown) | undefined;
    if (typeof orig !== "function") continue;
    p[name] = function (this: { canvas: AnyCanvas }, ...a: unknown[]) {
      if (!internalCanvases.has(this.canvas)) { note(evidence.canvasTexts, this.canvas, String(a[0])); drawnAfterReady(); }
      return orig.apply(this, a);
    };
  }
  for (const name of images) {
    const orig = p[name] as ((this: { canvas: AnyCanvas }, ...a: unknown[]) => unknown) | undefined;
    if (typeof orig !== "function") continue;
    p[name] = function (this: { canvas: AnyCanvas }, ...a: unknown[]) {
      if (!internalCanvases.has(this.canvas)) for (const x of a) { const url = imageUrl(x); if (url) note(evidence.canvasImages, this.canvas, url); }
      return orig.apply(this, a);
    };
  }
}

const g = globalThis as unknown as Record<string, { prototype: object } | undefined>;
for (const name of ["CanvasRenderingContext2D", "OffscreenCanvasRenderingContext2D"]) {
  patchCanvas(g[name]?.prototype, ["fillText", "strokeText"], ["drawImage", "createPattern"]);
}
for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) patchCanvas(g[name]?.prototype, [], ["texImage2D", "texSubImage2D"]);

// A canvas handed to a worker is drawn where the kit cannot see.
if (typeof HTMLCanvasElement !== "undefined" && HTMLCanvasElement.prototype.transferControlToOffscreen) {
  const transfer = HTMLCanvasElement.prototype.transferControlToOffscreen;
  HTMLCanvasElement.prototype.transferControlToOffscreen = function (this: HTMLCanvasElement) {
    note(evidence.canvasTexts, this, "(canvas drawn off the main thread)");
    return transfer.call(this);
  };
}

// Every shadow root is open, so ready() can read it. A closed root that already exists (declarative markup, or a
// script that ran before the kit) is reported by ready() instead.
const attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
  return attachShadow.call(this, { ...init, mode: "open" });
};
