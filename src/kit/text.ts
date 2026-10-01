import { ctx, state } from "./runtime.js";

function text(id: string): string {
  const c = ctx();
  const v = c.claims[id];
  if (v === undefined) throw new Error(`Unknown claim "${id}" for locale ${c.locale.code}; add it to claims.json`);
  return v;
}

function el(tag: string, id: string, parent?: HTMLElement): HTMLElement {
  const n = document.createElement(tag);
  n.dataset.claim = id;
  n.innerText = text(id);
  if (parent) parent.appendChild(n);
  return n;
}

export const t = Object.assign(text, { el });

export interface HeadlineOptions { maxSize: number; minSize?: number; maxLines?: number; lineHeight?: number }
export interface HeadlineResult { size: number; lines: number; shrink: number; bottom: number; overflow: boolean }

// Largest size in [minSize, maxSize] (0.5 px steps) where the text has at most maxLines lines and no word overflows.
export async function headline(el: HTMLElement, id: string, o: HeadlineOptions): Promise<HeadlineResult> {
  if (!el.isConnected) throw new Error("headline(): add the element to the page before calling headline(), so it can be measured");
  const minSize = o.minSize ?? Math.round(o.maxSize * 0.6), maxLines = o.maxLines ?? 2, lh = o.lineHeight ?? 1.08;
  el.dataset.claim = id;
  el.innerText = t(id);
  el.style.lineHeight = String(lh);
  await document.fonts.ready;
  const measure = (size: number) => {
    el.style.fontSize = `${size}px`;
    const lines = Math.round(el.getBoundingClientRect().height / state.scale / (size * lh));
    return { ok: lines <= maxLines && el.scrollWidth <= el.clientWidth + 1, lines };
  };
  let size = o.maxSize;
  if (!measure(size).ok) {
    let lo = minSize, hi = o.maxSize;
    if (!measure(lo).ok) size = -1;
    else { while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (measure(mid).ok) lo = mid; else hi = mid; } size = Math.floor(lo * 2) / 2; }
  }
  const overflow = size < 0;
  if (overflow) { size = minSize; el.dataset.overflow = "1"; }
  const { lines } = measure(size);
  const shrink = Math.round((size / o.maxSize) * 1000) / 1000;
  el.dataset.shrink = String(shrink);
  return { size, lines, shrink, bottom: el.getBoundingClientRect().bottom / state.scale, overflow };
}
