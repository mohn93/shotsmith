import type { KitContext } from "../shared/context.js";
import { installPatches } from "../shared/patches.js";
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

// The renderer installs these before any page script runs; this covers pages opened any other way.
installPatches();

// Kit canvases (the status bar in composeScreen, lift crops) are only registered while the kit draws on them, so text
// a page later draws on a canvas the kit handed out is still recorded.
export function drawInternal<T>(canvas: HTMLCanvasElement | OffscreenCanvas, draw: () => T): T {
  const internal = window.__shotsmithPatches!.internal;
  internal.add(canvas);
  try { return draw(); } finally { internal.delete(canvas); }
}
