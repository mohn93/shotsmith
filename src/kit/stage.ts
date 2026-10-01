import type { FormFactor, Platform, Store } from "../config/targets.js";
import type { KitContext } from "../shared/context.js";
import { href } from "./device.js";
import { LOGICAL_WIDTH, state } from "./runtime.js";

export interface Stage {
  root: HTMLDivElement; W: number; H: number; scale: number; target: KitContext["target"]; platform: Platform; store: Store;
  locale: string; dir: "ltr" | "rtl"; formFactor: FormFactor;
  pick<T>(o: { tall: T } & Partial<Record<FormFactor, T>>): T;
}

function fontCss(c: KitContext): string {
  const faces = Object.values(c.fonts).flatMap((f) => f.faces.map((face) => `@font-face{font-family:"${f.family}";font-weight:${face.weight};src:url("${href(face.url)}")}`));
  const vars = Object.entries(c.fonts).map(([role, f]) => `--font-${role}:"${f.family}"`).join(";");
  return `${faces.join("\n")}\n:root{${vars}}`;
}

async function loadFonts(c: KitContext): Promise<void> {
  for (const f of Object.values(c.fonts)) for (const face of f.faces) {
    // A file the browser cannot decode (an HTML error page saved as .ttf, a truncated download) rejects with a bare NetworkError.
    const loaded = await document.fonts.load(`${face.weight.split(" ")[0]} 40px "${f.family}"`).catch(() => {
      throw new Error(`Font "${f.family}" (${face.url}) could not be decoded (corrupt or unsupported format)`);
    });
    if (!loaded.length) throw new Error(`Font "${f.family}" (${face.url}) failed to load`);
  }
}

export async function stage(): Promise<Stage> {
  const q = new URLSearchParams(location.search);
  const page = (location.pathname.split("/").pop() ?? "").replace(/\.html$/, "");
  const res = await fetch(`/__shotsmith/context.json?t=${encodeURIComponent(q.get("t") ?? "")}&l=${encodeURIComponent(q.get("l") ?? "")}&p=${encodeURIComponent(page)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `context request failed (${res.status})`);
  const c = body as KitContext;
  state.ctx = c;
  state.warnings.push(...c.warnings);
  state.scale = c.target.w / LOGICAL_WIDTH;
  state.W = LOGICAL_WIDTH;
  state.H = Math.round(c.target.h / state.scale);

  document.documentElement.lang = c.locale.code;
  document.documentElement.dir = c.locale.dir;
  const style = document.createElement("style");
  style.textContent = `${fontCss(c)}
html,body{margin:0;padding:0;width:${c.target.w}px;height:${c.target.h}px;overflow:hidden;background:#000}
#stage{position:relative;width:${state.W}px;height:${state.H}px;overflow:hidden;isolation:isolate;transform:scale(${state.scale});transform-origin:0 0;font-family:var(--font-text),sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}`;
  document.head.appendChild(style);
  const root = document.createElement("div");
  root.id = "stage";
  document.body.appendChild(root);
  state.root = root;
  await loadFonts(c);

  return {
    root, W: state.W, H: state.H, scale: state.scale, target: c.target, platform: c.target.platform, store: c.target.store,
    locale: c.locale.code, dir: c.locale.dir, formFactor: c.target.formFactor,
    pick: (o) => (o[c.target.formFactor] ?? o.tall),
  };
}
