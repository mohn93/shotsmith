import { ctx } from "./runtime.js";

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
