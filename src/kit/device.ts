import type { KitContext } from "../shared/context.js";
import { ctx, drawInternal, state, waitFor } from "./runtime.js";

type Kind = "iphone" | "android" | "ipad" | "atab";
const KIND: Record<string, Kind> = { iphone: "iphone", "android-phone": "android", ipad: "ipad", "android-tablet": "atab" };
// Chrome sizes in points: status band, bottom band, screen corner radius.
const SPEC: Record<Kind, { top: number; bot: number; r: number }> = {
  iphone: { top: 54, bot: 34, r: 62 }, android: { top: 36, bot: 24, r: 22 }, ipad: { top: 24, bot: 20, r: 18 }, atab: { top: 32, bot: 24, r: 18 },
};
const pxPerPoint = (kind: Kind, cw: number, pointWidth: number | null) =>
  pointWidth ? cw / pointWidth : kind === "iphone" ? 3 : kind === "ipad" ? 2 : kind === "android" ? cw / 411 : cw / 800;

export interface DeviceOptions {
  capture: string; x: number; y: number; width: number; tilt?: number | string; repaint?: boolean; homeIndicator?: boolean;
  shadow?: boolean; finish?: "graphite" | "silver"; z?: number; parent?: HTMLElement;
}
export interface Screen { url: string; w: number; h: number; r: number; capTop: number; capW: number; capH: number }
export interface Device {
  el: HTMLDivElement; screen: HTMLImageElement; image: HTMLImageElement; k: number; sw: number; sh: number; capTop: number; tilted: boolean;
  toStage(cx: number, cy: number): [number, number]; toLocal(cx: number, cy: number): [number, number]; pixel(cx: number, cy: number): string;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`Could not load ${src}`)); i.src = src;
});
const luminance = (c: readonly number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const rgb = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

function probe(img: HTMLImageElement) {
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext("2d", { willReadFrequently: true })!; drawInternal(c, () => x.drawImage(img, 0, 0));
  return (px: number, py: number) => {
    const d = x.getImageData(Math.max(0, Math.min(c.width - 1, Math.round(px))), Math.max(0, Math.min(c.height - 1, Math.round(py))), 1, 1).data;
    return [d[0], d[1], d[2]] as const;
  };
}

const fontSpec = (weight: number, size: number, family: string) =>
  `${weight} ${size}px ${family === "sans-serif" ? family : `"${family}"`}`;

function drawStatusBar(x: CanvasRenderingContext2D, kind: Kind, w: number, u: number, ink: string, family: string) {
  const Wp = w / u;
  x.fillStyle = ink; x.strokeStyle = ink; x.lineCap = "round";
  const wifi = (cx: number, cy: number, s: number, lw: number) => {
    x.save(); x.translate(cx, cy); x.lineWidth = lw;
    for (const rr of [0.29, 0.64, 1]) { x.beginPath(); x.arc(0, 0, rr * s, -Math.PI * 0.75, -Math.PI * 0.25); x.stroke(); }
    x.beginPath(); x.arc(0, 0, 0.12 * s, 0, Math.PI * 2); x.fill(); x.restore();
  };
  const battery = (bx: number, by: number, bw: number, bh: number) => {
    x.lineWidth = bh * 0.09; x.globalAlpha = 0.45;
    x.beginPath(); x.roundRect(bx, by - bh / 2, bw, bh, bh * 0.3); x.stroke();
    x.beginPath(); x.roundRect(bx + bw + bh * 0.08, by - bh * 0.17, bh * 0.13, bh * 0.34, bh * 0.06); x.fill(); x.globalAlpha = 1;
    x.beginPath(); x.roundRect(bx + bh * 0.17, by - bh * 0.33, bw - bh * 0.34, bh * 0.66, bh * 0.18); x.fill();
  };
  if (kind === "iphone") {
    x.font = fontSpec(600, 17 * u, family); x.textBaseline = "middle"; x.textAlign = "center";
    x.fillText("9:41", Wp * 0.177 * u, 30.5 * u);
    x.fillStyle = "#000"; x.beginPath(); x.roundRect(w / 2 - 63 * u, 11 * u, 126 * u, 37 * u, 18.5 * u); x.fill();
    x.fillStyle = ink;
    const bx = (Wp - 112) * u, by = 30.5 * u;
    for (let i = 0; i < 4; i++) { const bh = (4 + i * 2.2) * u; x.beginPath(); x.roundRect(bx + i * 4.6 * u, by + 5.5 * u - bh, 3 * u, bh, u); x.fill(); }
    wifi((Wp - 78) * u, by + 5 * u, 11.2 * u, 2.1 * u);
    battery((Wp - 60) * u, by, 25 * u, 12 * u);
  } else if (kind === "ipad") {
    x.font = fontSpec(600, 13 * u, family); x.textBaseline = "middle"; x.textAlign = "left";
    x.fillText("9:41", 20 * u, 12.5 * u);
    x.font = fontSpec(500, 13 * u, family); x.fillText("Wed Sep 9", 20 * u + x.measureText("9:41 ").width + 4 * u, 12.5 * u);
    wifi(w - 72 * u, 16 * u, 9 * u, 1.8 * u);
    battery(w - 50 * u, 12.5 * u, 22 * u, 10.5 * u);
  } else {
    const mid = SPEC[kind].top * u / 2, rx = w - 20 * u;
    x.font = fontSpec(500, 14 * u, family); x.textBaseline = "middle"; x.textAlign = "left";
    x.fillText("9:41", 20 * u, mid);
    if (kind === "android") { x.fillStyle = "#050505"; x.beginPath(); x.arc(w / 2, mid, 5.5 * u, 0, Math.PI * 2); x.fill(); x.fillStyle = ink; }
    x.beginPath(); x.roundRect(rx - 7 * u, mid - 6.5 * u, 7 * u, 13 * u, 1.6 * u); x.fill();
    x.beginPath(); x.roundRect(rx - 5.2 * u, mid - 8 * u, 3.4 * u, 2 * u, 0.6 * u); x.fill();
    x.beginPath(); x.moveTo(rx - 13 * u, mid + 6.5 * u); x.lineTo(rx - 26 * u, mid + 6.5 * u); x.lineTo(rx - 13 * u, mid - 6.5 * u); x.closePath(); x.fill();
    x.save(); x.translate(rx - 38 * u, mid + 6.5 * u); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 13 * u, -Math.PI * 0.75, -Math.PI * 0.25); x.closePath(); x.fill(); x.restore();
  }
}

// Names the folders searched, locale folder first, and the captures that do exist.
export function missingCapture(c: KitContext, name: string): Error {
  const p = c.target.platform, l = c.locale.code, d = c.defaultLocale;
  const dirs = [`inputs/${p}/${l}/`, ...(l !== d ? [`inputs/${p}/${d}/`] : []), `inputs/${p}/`];
  const names = Object.keys(c.captures.files).sort();
  return new Error(`No capture "${name}" for ${p} (looked in ${dirs.join(", ")}); available: ${names.length ? names.join(", ") : "none"}`);
}

export function composeScreen(img: HTMLImageElement, o: { repaint?: boolean; homeIndicator?: boolean }): Screen {
  const c = ctx();
  const kind = KIND[c.target.platform];
  const cw = img.naturalWidth, ch = img.naturalHeight, sp = SPEC[kind];
  const u = pxPerPoint(kind, cw, c.captures.pointWidth);
  const mode = c.captures.statusBar;
  const top = mode === "none" ? Math.round(sp.top * u) : 0;
  const bot = mode === "none" || o.homeIndicator ? Math.round(sp.bot * u) : 0;
  const w = cw, h = ch + top + bot, r = sp.r * u;
  const at = probe(img);
  const topBg = at(4, 1), botBg = at(4, ch - 2);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const x = cv.getContext("2d")!;
  // The status bar is kit chrome: its text is not page copy.
  drawInternal(cv, () => {
    x.save(); x.beginPath(); x.roundRect(0, 0, w, h, r); x.clip();
    if (top) { x.fillStyle = rgb(topBg); x.fillRect(0, 0, w, top + 2); }
    if (bot) { x.fillStyle = rgb(botBg); x.fillRect(0, top + ch - 2, w, bot + 2); }
    x.drawImage(img, 0, top);
    if (mode === "included" && o.repaint) { x.fillStyle = rgb(topBg); x.fillRect(0, 0, w, Math.round(sp.top * u)); }
    const family = c.fonts.text?.family ?? c.fonts.display?.family ?? "sans-serif";
    if (top || (mode === "included" && o.repaint)) drawStatusBar(x, kind, w, u, luminance(topBg) < 0.5 ? "#ffffff" : "#0b0b0d", family);
    if (bot) {
      x.fillStyle = luminance(botBg) < 0.5 ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.88)";
      const len = kind === "ipad" ? 160 : kind === "iphone" ? 134 : 108;
      x.beginPath(); x.roundRect(w / 2 - (len * u) / 2, h - 13 * u, len * u, 5 * u, 2.5 * u); x.fill();
    }
    x.restore();
  });
  return { url: cv.toDataURL("image/png"), w, h, r, capTop: top, capW: cw, capH: ch };
}

function div(style: Partial<CSSStyleDeclaration>, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement("div"); Object.assign(d.style, style); parent.appendChild(d); return d;
}

export async function device(o: DeviceOptions): Promise<Device> {
  const c = ctx();
  const kind = KIND[c.target.platform];
  const file = c.captures.files[o.capture];
  if (!file) throw missingCapture(c, o.capture);
  if (file.fallback) state.warnings.push(`capture.fallback: "${o.capture}" for ${c.locale.code} uses ${file.url}`);
  const image = await waitFor(loadImage(file.url));
  const scr = composeScreen(image, o);
  const parent = o.parent ?? state.root!;

  const sw = o.width, k = sw / scr.w, sh = scr.h * k;
  const F = { iphone: [0.026, 0.0085], android: [0.02, 0.007], ipad: [0.03, 0.0055], atab: [0.036, 0.0055] }[kind];
  const bez = Math.round(sw * F[0]), rim = Math.max(4, Math.round(sw * F[1]));
  const ow = sw + 2 * (bez + rim), oh = sh + 2 * (bez + rim), off = bez + rim;
  const sr = scr.r * k, or = sr + bez + rim;
  const shadow = o.shadow ?? true;
  const tone = o.finish === "silver"
    ? { body: "linear-gradient(135deg,#f4f5f7 0%,#c9ccd2 16%,#aeb2ba 45%,#bfc2c9 70%,#eceef1 100%)", btn: "linear-gradient(90deg,#e4e6ea,#b4b8c0 60%,#d6d9de)", edge: 70 }
    : { body: "linear-gradient(135deg,#6b6e78 0%,#2a2c33 16%,#17181d 45%,#1d1f25 70%,#565962 100%)", btn: "linear-gradient(90deg,#3b3d44,#1c1d22 60%,#2d2f36)", edge: 30 };
  const tilt = typeof o.tilt === "number" ? `perspective(4000px) rotateY(${o.tilt}deg)` : o.tilt;

  const wrap = div({ position: "absolute", left: `${o.x - off}px`, top: `${o.y - off}px`, width: `${ow}px`, height: `${oh}px`, zIndex: String(o.z ?? 10), transformStyle: "preserve-3d" }, parent);
  if (tilt) { wrap.style.transform = tilt; wrap.style.transformOrigin = "50% 40%"; }
  const btn = (side: "left" | "right", t: number, hgt: number) => div({ position: "absolute", [side]: `${-rim * 0.9}px`, top: `${oh * t}px`, width: `${rim * 1.6}px`, height: `${oh * hgt}px`, borderRadius: `${rim}px`, background: tone.btn } as Partial<CSSStyleDeclaration>, wrap);
  if (kind === "iphone") { btn("left", 0.155, 0.035); btn("left", 0.215, 0.062); btn("left", 0.292, 0.062); btn("right", 0.245, 0.095); }
  else if (kind === "android") { btn("right", 0.19, 0.075); btn("right", 0.3, 0.05); }
  else div({ position: "absolute", right: `${ow * 0.08}px`, top: `${-rim * 0.9}px`, width: `${ow * 0.07}px`, height: `${rim * 1.6}px`, borderRadius: `${rim}px`, background: tone.btn }, wrap);
  if (tilt) {
    const n = 14, depth = sw * 0.03;
    for (let i = n; i >= 1; i--) {
      const f = i / n;
      div({ position: "absolute", inset: "0", borderRadius: `${or}px`, transform: `translateZ(${-f * depth}px)`,
        background: `linear-gradient(135deg, hsl(230,6%,${tone.edge + 4 - f * 16}%) 0%, hsl(230,6%,${tone.edge - 14 - f * 6}%) 40%, hsl(230,6%,${tone.edge - 18 - f * 5}%) 70%, hsl(230,6%,${tone.edge - f * 12}%) 100%)`,
        boxShadow: i === n && shadow ? "0 80px 120px -30px rgba(0,0,0,0.75)" : "none" }, wrap);
    }
  }
  const body = div({ position: "absolute", inset: "0", borderRadius: `${or}px`, background: tone.body,
    boxShadow: shadow ? "0 80px 120px -30px rgba(0,0,0,0.75), 0 30px 60px -20px rgba(0,0,0,0.55)" : "none" }, wrap);
  div({ position: "absolute", left: `${rim}px`, top: `${rim}px`, right: `${rim}px`, bottom: `${rim}px`, borderRadius: `${or - rim}px`, background: "#020203",
    boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.10), 0 0 0 1px rgba(0,0,0,0.6)" }, body);
  if (kind === "atab" || kind === "ipad") {
    const cr = Math.max(3, bez * 0.16);
    div({ position: "absolute", left: `${(kind === "atab" ? ow / 2 : ow - rim - bez / 2) - cr}px`, top: `${(kind === "atab" ? rim + bez / 2 : oh / 2) - cr}px`,
      width: `${2 * cr}px`, height: `${2 * cr}px`, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #2a3140, #07080b 70%)", zIndex: "2" }, wrap);
  }
  const screen = document.createElement("img");
  screen.src = scr.url;
  Object.assign(screen.style, { position: "absolute", left: `${off}px`, top: `${off}px`, width: `${sw}px`, height: `${sh}px`, borderRadius: `${sr}px` });
  wrap.appendChild(screen);
  await waitFor(screen.decode());

  state.captures.add(file.url);
  state.devices.push({ platform: c.target.platform, capture: o.capture, statusBar: c.captures.statusBar, repaint: !!o.repaint, screen: [scr.w, scr.h] });
  const sample = probe(image);
  return {
    el: wrap, screen, image, k, sw, sh, capTop: scr.capTop, tilted: !!tilt,
    toStage: (cx, cy) => [o.x + cx * k, o.y + (cy + scr.capTop) * k],
    toLocal: (cx, cy) => [off + cx * k, off + (cy + scr.capTop) * k],
    pixel: (cx, cy) => rgb(sample(cx, cy)),
  };
}
