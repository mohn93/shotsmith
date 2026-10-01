// e-flighty design system: one coherent look for the DNS Kit set, in Flighty's visual language.
// Layers per page: WebGL atmosphere (or a three.js scene) at the back, then DOM: phone, glass cards, type.
// Layout is authored in a 1260-wide logical space; each target scales it uniformly (PX) to its exact size.
export let W = 1260, H = 2736, PX = 1, RW = 1260, RH = 2736;
export function configure(realW, realH) { RW = realW; RH = realH; PX = realW / 1260; W = 1260; H = Math.round(realH / PX); }
export const TARGETS = {
  "iphone-6.9": { w: 1290, h: 2796, device: "iphone", inputs: "iphone", ff: "tall", fonts: "sf" },
  "iphone-6.5": { w: 1242, h: 2688, device: "iphone", inputs: "iphone", ff: "tall", fonts: "sf" },
  "android-phone": { w: 1080, h: 1920, device: "android", inputs: "android-phone", ff: "p916", fonts: "inter" },
  "ipad-13": { w: 2064, h: 2752, device: "ipad", inputs: "ipad", ff: "t43", fonts: "sf" },
  "android-tablet": { w: 1440, h: 2560, device: "atab", inputs: "android-tablet", ff: "t916", fonts: "inter" },
};
// Pick per-form-factor layout values: L({ tall, p916, t43, t916 }) (missing keys fall back to tall).
export const L = (o) => (T.ff in o ? o[T.ff] : o.tall);
// Optional per-platform measurements of the captures (crop boxes, values), keyed by T.inputs:
// export const DATA = { iphone: { ring: [x0, y0, x1, y1], ... }, "android-phone": { ... } }. Measure them by
// scanning capture pixels. Missing data.js leaves D empty, so pages that read D need their own.
const _DATA = (await import("./data.js").catch(() => ({ DATA: {} }))).DATA;
export const D = _DATA[TARGETS[new URLSearchParams(location.search).get("t") || "iphone-6.9"].inputs] || {};
export const T = (() => { const t = new URLSearchParams(location.search).get("t") || "iphone-6.9"; return { name: t, ...TARGETS[t] }; })();

// ---------- palette ----------
export const C = {
  ink: "#0b0a10",
  white: "#ffffff",
  gray: "rgba(235,235,245,0.60)",      // iOS secondary label on dark
  gray2: "rgba(235,235,245,0.38)",
  violet: "#8f6cf5", violetDeep: "#5b3fd6", lilac: "#e4d6ff",
  yellow: "#f7c63d", coral: "#ff7a5c", teal: "#39d3c9",
  green: "#30d158", amber: "#ff9f0a", red: "#ff453a", blue: "#0a84ff",
};

// Per-screen moods (sRGB 0..1). top/bottom gradient + glow pools + fog.
export const MOODS = {
  violet: { top: [0.075, 0.066, 0.105], bot: [0.043, 0.039, 0.063] },
};

// ---------- fonts ----------
// Pages only ever name three logical families: UIDisplay, UIText, UIMono. Each target picks a face set.
//  sf:    SF Pro Display / Text + SF Mono, Apple-licensed for Apple-platform mockups only. Never copied into this
//         tree: loaded from the local system install via render.mjs's /sysfont/<file> route (FONT_DIRS).
//  inter: Inter (OFL), from the workspace fonts/ folder. Only real weights: 400/500 -> Regular, 600/700 -> Bold, 800+ -> ExtraBold.
//         No OFL monospace is bundled, so UIMono is Inter too on these targets.
const SF = "/sysfont/", IN = "/fonts/";
export const FONT_SETS = {
  sf: {
    UIDisplay: [["400", SF + "SF-Pro-Display-Regular.otf"], ["500", SF + "SF-Pro-Display-Medium.otf"],
      ["600", SF + "SF-Pro-Display-Semibold.otf"], ["700", SF + "SF-Pro-Display-Bold.otf"], ["800", SF + "SF-Pro-Display-Heavy.otf"]],
    UIText: [["400", SF + "SF-Pro-Text-Regular.otf"], ["500", SF + "SF-Pro-Text-Medium.otf"],
      ["600", SF + "SF-Pro-Text-Semibold.otf"], ["700", SF + "SF-Pro-Text-Bold.otf"]],
    UIMono: [["400 700", SF + "SFNSMono.ttf"]],
  },
  inter: Object.fromEntries(["UIDisplay", "UIText", "UIMono"].map((f) => [f,
    [["100 500", IN + "Inter-Regular.ttf"], ["600 700", IN + "Inter-Bold.ttf"], ["800 900", IN + "Inter-ExtraBold.ttf"]]])),
};
const fontFaces = () => Object.entries(FONT_SETS[T.fonts]).flatMap(([fam, faces]) =>
  faces.map(([wt, url]) => `@font-face{font-family:${fam};font-weight:${wt};src:url(${url})}`)).join("\n");

// ---------- base CSS ----------
const CSS = () => `
${fontFaces()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${RW}px;height:${RH}px;overflow:hidden;background:#000}
body{font-family:UIText;font-synthesis:none;color:#fff;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;isolation:isolate;transform:scale(${PX});transform-origin:0 0}
#stage>canvas.bg{position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:0}
.abs{position:absolute}
.copy{position:absolute;left:0;right:0;z-index:40;text-align:center}
.eyebrow{display:inline-flex;align-items:center;gap:14px;height:92px;padding:0 38px;border-radius:24px;
  font:600 46px/1 UIDisplay;letter-spacing:0.02em;text-transform:uppercase;border:3.5px solid currentColor}
.eyebrow.solid{border:none;color:#fff}
.eyebrow svg{width:50px;height:50px}
.h1{font:700 106px/1.06 UIDisplay;letter-spacing:-0.012em;color:#fff}
.sub{font:400 58px/1.24 UIDisplay;letter-spacing:-0.004em;margin-top:30px}
.glass{position:absolute;border-radius:52px;overflow:hidden;z-index:30;
  -webkit-backdrop-filter:blur(44px) saturate(1.5);backdrop-filter:blur(44px) saturate(1.5)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(172deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.02) 28%, rgba(255,255,255,0) 55%)}
.glass::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  box-shadow:inset 0 0 0 2.5px rgba(255,255,255,0.13), inset 0 2.5px 0 rgba(255,255,255,0.10)}
.g-head{display:flex;align-items:center;justify-content:space-between;padding:0 46px;height:124px;
  border-bottom:2px solid rgba(255,255,255,0.10)}
.g-title{font:500 48px/1 UIDisplay;letter-spacing:-0.005em}
.g-meta{font:500 44px/1 UIDisplay;display:flex;align-items:center;gap:12px}
.g-row{display:flex;align-items:flex-start;gap:34px;padding:34px 46px 36px 40px;position:relative}
.g-row+.g-row::before{content:"";position:absolute;left:150px;right:0;top:0;border-top:2px solid rgba(255,255,255,0.10)}
.g-ic{flex:0 0 76px;height:76px;display:flex;align-items:center;justify-content:center;margin-top:4px}
.g-ic svg{width:66px;height:66px}
.g-body{flex:1;min-width:0}
.g-rt{font:600 48px/1.12 UIDisplay;letter-spacing:-0.006em}
.g-rs{font:400 42px/1.26 UIText;letter-spacing:-0.004em;color:rgba(235,235,245,0.66);margin-top:8px}
.g-rv{font:500 42px/1 UIDisplay;color:rgba(235,235,245,0.55);margin-top:10px;white-space:nowrap}
.mono{font-family:UIMono;letter-spacing:-0.01em}
`;

export function el(tag, attrs = {}, parent, html) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (k === "class") n.className = v;
    else n.setAttribute(k, v);
  }
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}

export function setup() {
  configure(T.w, T.h);
  el("style", {}, document.head, CSS());
  const stage = el("div", { id: "stage" }, document.body);
  return stage;
}

export async function ready(extra = []) {
  const fams = Object.entries(FONT_SETS[T.fonts]).flatMap(([f, faces]) => faces.map(([wt]) => `${wt.split(" ")[0]} 40px ${f}`));
  const got = await Promise.all(fams.map((f) => document.fonts.load(f)));
  const miss = fams.filter((f, i) => !got[i].length);
  if (miss.length) throw new Error("fonts failed to load: " + miss.join(", "));
  await document.fonts.ready;
  fitHeadlines();
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  await Promise.all(extra);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ready = true;
}

// ---------- type ----------
export function eyebrow(parent, text, { color = C.yellow, solid = false, icon = "" } = {}) {
  const e = el("div", { class: "eyebrow" + (solid ? " solid" : "") }, parent, icon + `<span>${text}</span>`);
  if (solid) e.style.background = color; else e.style.color = color;
  return e;
}

// Title metrics per form factor (logical px; logical width is always 1260).
export const TM = () => L({
  tall: { top: 118, size: 100, sub: 58, gap: 44, eb: 1 },
  p916: { top: 92, size: 92, sub: 52, gap: 34, eb: 0.92 },
  t43:  { top: 72, size: 84, sub: 46, gap: 28, eb: 0.82 },
  t916: { top: 104, size: 96, sub: 54, gap: 38, eb: 0.95 },
});
// Centered Flighty block: eyebrow, bold title-case headline, muted subline.
const FIT = [];
function fitHeadlines() {
  for (const { h, size, maxW } of FIT) {
    h.style.whiteSpace = "nowrap"; h.style.display = "inline-block";
    const w = h.getBoundingClientRect().width / PX;
    h.style.display = "";
    if (w > maxW) h.style.fontSize = Math.floor(size * maxW / w) + "px";
  }
}
export function titleBlock(stage, { top, eyebrow: eb, ebColor, ebSolid, ebIcon, lines, sub, subColor = "rgba(210,200,235,0.70)", size, gap, align = "center", left = 0 }) {
  const m = TM();
  top = top ?? m.top; size = size ?? m.size; gap = gap ?? m.gap;
  const box = el("div", { class: "copy", style: { top: top + "px", textAlign: align, left: left + "px" } }, stage);
  if (eb) { const e = eyebrow(box, eb, { color: ebColor, solid: ebSolid, icon: ebIcon }); e.style.zoom = m.eb; }
  const h = el("div", { class: "h1", style: { fontSize: size + "px", marginTop: (eb ? gap : 0) + "px", textAlign: align } }, box, lines.join("<br>"));
  // Each authored line must stay one line. Faces differ in width (Inter runs wider than SF), so once fonts
  // are loaded ready() shrinks the headline just enough if its widest line overflows the side margins.
  FIT.push({ h, size, maxW: align === "center" ? W - 2 * 40 : W - left - 40 });   // keep >= 40px to the frame edge
  let s = null;
  if (sub) s = el("div", { class: "sub", style: { color: subColor, fontSize: m.sub + "px", marginTop: m.gap * 0.7 + "px", textAlign: align } }, box, sub.join ? sub.join("<br>") : sub);
  return { box, h, s };
}

// ---------- device screens ----------
// Assumes captures are content only (no status bar): the presentation chrome (status bar, island / camera
// cutout, home indicator, rounded screen) is drawn here as original vector art; the capture is scaled 1:1
// inside. If your captures include a status bar, drop the drawn one or paint over the capture's (SKILL.md).
// CAPS maps screen ids to capture file names under inputs/<platform>/; these are the DNS Kit names.
export const CAPS = { "01": "01-domains", "02": "02-email", "03": "03-monitors", "04": "04-propagation", "05": "05-records", "06": "06-pro" };
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
export async function deviceScreen(id, device = T.device) {
  await Promise.all(["600 50px UIText", "500 40px UIText"].map((f) => document.fonts.load(f)));
  const img = await loadImg(`/inputs/${T.inputs}/${CAPS[id]}.png`);
  const cw = img.naturalWidth, ch = img.naturalHeight;
  // u = one point / dp in capture px (all captures are 3x)
  const spec = {
    iphone: { u: cw / 430, top: 54, bot: 34, r: 62 },
    android: { u: cw / 390, top: 36, bot: 24, r: 22 },
    ipad: { u: cw / 768, top: 24, bot: 20, r: 18 },
    atab: { u: cw / 800, top: 32, bot: 24, r: 18 },
  }[device];
  const u = spec.u, top = Math.round(spec.top * u), bot = Math.round(spec.bot * u), r = spec.r * u;
  const w = cw, h = ch + top + bot;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  const probe = document.createElement("canvas"); probe.width = cw; probe.height = ch;
  const px = probe.getContext("2d", { willReadFrequently: true }); px.drawImage(img, 0, 0);
  const col = (yy) => { const d = px.getImageData(4, yy, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
  x.save(); x.beginPath(); x.roundRect(0, 0, w, h, r); x.clip();
  x.fillStyle = col(1); x.fillRect(0, 0, w, top + 2);
  x.fillStyle = col(ch - 2); x.fillRect(0, top + ch - 2, w, bot + 2);
  x.drawImage(img, 0, top);
  const ink = "#0b0b0d";
  x.fillStyle = ink; x.strokeStyle = ink; x.lineCap = "round";
  const wifi = (cx, cy, s, lw) => { x.save(); x.translate(cx, cy); x.lineWidth = lw;
    for (const rr of [0.29, 0.64, 1]) { x.beginPath(); x.arc(0, 0, rr * s, -Math.PI * 0.75, -Math.PI * 0.25); x.stroke(); }
    x.beginPath(); x.arc(0, 0, 0.12 * s, 0, Math.PI * 2); x.fill(); x.restore(); };
  const battH = (bx, by, bw, bh, level = 1) => { x.lineWidth = bh * 0.09; x.globalAlpha = 0.45;
    x.beginPath(); x.roundRect(bx, by - bh / 2, bw, bh, bh * 0.3); x.stroke();
    x.beginPath(); x.roundRect(bx + bw + bh * 0.08, by - bh * 0.17, bh * 0.13, bh * 0.34, bh * 0.06); x.fill(); x.globalAlpha = 1;
    x.beginPath(); x.roundRect(bx + bh * 0.17, by - bh * 0.33, (bw - bh * 0.34) * level, bh * 0.66, bh * 0.18); x.fill(); };
  if (device === "iphone") {
    x.font = `600 ${17 * u}px UIText`; x.textBaseline = "middle"; x.textAlign = "center";
    x.fillText("9:41", 76 * u, 30.5 * u);
    x.fillStyle = "#000"; x.beginPath(); x.roundRect(w / 2 - 63 * u, 11 * u, 126 * u, 37 * u, 18.5 * u); x.fill();   // island (original vector)
    x.fillStyle = ink;
    const bx = 318 * u, by = 30.5 * u;
    for (let i = 0; i < 4; i++) { const bh = (4 + i * 2.2) * u; x.beginPath(); x.roundRect(bx + i * 4.6 * u, by + 5.5 * u - bh, 3 * u, bh, 1 * u); x.fill(); }
    wifi(352 * u, by + 5 * u, 11.2 * u, 2.1 * u);
    battH(370 * u, by, 25 * u, 12 * u);
    x.fillStyle = "rgba(0,0,0,0.88)"; x.beginPath(); x.roundRect(w / 2 - 67 * u, h - 13 * u, 134 * u, 5 * u, 2.5 * u); x.fill();
  } else if (device === "ipad") {
    x.font = `600 ${13 * u}px UIText`; x.textBaseline = "middle"; x.textAlign = "left";
    x.fillText("9:41", 20 * u, 12.5 * u);
    x.font = `500 ${13 * u}px UIText`; x.fillText("Wed Sep 9", 20 * u + x.measureText("9:41 ").width + 4 * u, 12.5 * u);
    wifi(w - 72 * u, 16 * u, 9 * u, 1.8 * u);
    battH(w - 50 * u, 12.5 * u, 22 * u, 10.5 * u);
    x.fillStyle = "rgba(0,0,0,0.88)"; x.beginPath(); x.roundRect(w / 2 - 160 * u / 2, h - 9 * u, 160 * u, 5 * u, 2.5 * u); x.fill();
  } else {
    // Android: status text uses the target's UIText (Inter); original vector icons
    const mid = spec.top * u / 2;
    x.font = `500 ${14 * u}px UIText`; x.textBaseline = "middle"; x.textAlign = "left";
    x.fillText("9:41", 20 * u, mid);
    if (device === "android") { x.fillStyle = "#050505"; x.beginPath(); x.arc(w / 2, mid, 5.5 * u, 0, Math.PI * 2); x.fill(); x.fillStyle = ink; }
    const rx = w - 20 * u;
    // battery (vertical, Material style)
    x.beginPath(); x.roundRect(rx - 7 * u, mid - 6.5 * u, 7 * u, 13 * u, 1.6 * u); x.fill();
    x.beginPath(); x.roundRect(rx - 5.2 * u, mid - 8 * u, 3.4 * u, 2 * u, 0.6 * u); x.fill();
    // signal triangle
    x.beginPath(); x.moveTo(rx - 13 * u, mid + 6.5 * u); x.lineTo(rx - 26 * u, mid + 6.5 * u); x.lineTo(rx - 13 * u, mid - 6.5 * u); x.closePath(); x.fill();
    // wifi (filled wedge)
    x.save(); x.translate(rx - 38 * u, mid + 6.5 * u); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 13 * u, -Math.PI * 0.75, -Math.PI * 0.25); x.closePath(); x.fill(); x.restore();
    x.fillStyle = "rgba(0,0,0,0.72)"; x.beginPath(); x.roundRect(w / 2 - 54 * u, h - 13 * u, 108 * u, 4 * u, 2 * u); x.fill();
  }
  x.restore();
  return { url: c.toDataURL("image/png"), w, h, r, u, capTop: top, capW: cw, capH: ch, device };
}

// Dark graphite phone with a thin black bezel around a composed device screen.
export function phone(parent, { scr, x, y, sw, tilt = null, z = 10, shadow = true, id = "" }) {
  const k = sw / scr.w, sh = scr.h * k;
  const dev = scr.device || "iphone";
  const F = { iphone: [0.026, 0.0085], android: [0.02, 0.007], ipad: [0.03, 0.0055], atab: [0.036, 0.0055] }[dev];
  const bez = Math.round(sw * F[0]), rim = Math.max(4, Math.round(sw * F[1]));
  const ow = sw + 2 * (bez + rim), oh = sh + 2 * (bez + rim);
  const sr = scr.r * k, or = sr + bez + rim;
  const wrap = el("div", { class: "phone" + (id ? " " + id : ""), style: {
    position: "absolute", left: x - bez - rim + "px", top: y - bez - rim + "px", width: ow + "px", height: oh + "px", zIndex: z,
    transformStyle: "preserve-3d" } }, parent);
  if (tilt) { wrap.style.transform = tilt; wrap.style.transformOrigin = "50% 40%"; }
  const btn = (side, t, hgt) => el("div", { style: { position: "absolute", [side]: -rim * 0.9 + "px", top: oh * t + "px", width: rim * 1.6 + "px",
    height: oh * hgt + "px", borderRadius: rim + "px", background: "linear-gradient(90deg,#3b3d44,#1c1d22 60%,#2d2f36)" } }, wrap);
  if (dev === "iphone") { btn("left", 0.155, 0.035); btn("left", 0.215, 0.062); btn("left", 0.292, 0.062); btn("right", 0.245, 0.095); }
  else if (dev === "android") { btn("right", 0.19, 0.075); btn("right", 0.30, 0.05); }
  else { el("div", { style: { position: "absolute", right: ow * 0.08 + "px", top: -rim * 0.9 + "px", width: ow * 0.07 + "px", height: rim * 1.6 + "px",
    borderRadius: rim + "px", background: "linear-gradient(180deg,#3b3d44,#1c1d22 60%,#2d2f36)" } }, wrap); }
  if (tilt) {   // stacked slices give the frame real edge thickness under a 3D tilt
    const n = 14, depth = sw * 0.03;
    for (let i = n; i >= 1; i--) {
      const t = i / n;
      el("div", { style: { position: "absolute", inset: 0, borderRadius: or + "px", transform: `translateZ(${-t * depth}px)`,
        background: `linear-gradient(135deg, hsl(230,6%,${34 - t * 16}%) 0%, hsl(230,6%,${16 - t * 6}%) 40%, hsl(230,6%,${12 - t * 5}%) 70%, hsl(230,6%,${30 - t * 12}%) 100%)`,
        boxShadow: i === n && shadow ? "0 80px 120px -30px rgba(0,0,0,0.75)" : "none" } }, wrap);
    }
  }
  const body = el("div", { style: { position: "absolute", inset: 0, borderRadius: or + "px",
    background: "linear-gradient(135deg,#6b6e78 0%,#2a2c33 16%,#17181d 45%,#1d1f25 70%,#565962 100%)",
    boxShadow: shadow ? "0 80px 120px -30px rgba(0,0,0,0.75), 0 30px 60px -20px rgba(0,0,0,0.55)" : "none" } }, wrap);
  el("div", { style: { position: "absolute", left: rim + "px", top: rim + "px", right: rim + "px", bottom: rim + "px",
    borderRadius: or - rim + "px", background: "#020203",
    boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.10), 0 0 0 1px rgba(0,0,0,0.6)" } }, body);
  if (dev === "atab" || dev === "ipad") {   // front camera in the bezel (original vector)
    const cr = Math.max(3, bez * 0.16);
    el("div", { style: { position: "absolute", left: (dev === "atab" ? ow / 2 : ow - rim - bez / 2) - cr + "px", top: (dev === "atab" ? rim + bez / 2 : oh / 2) - cr + "px",
      width: 2 * cr + "px", height: 2 * cr + "px", borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #2a3140, #07080b 70%)", zIndex: 2 } }, wrap);
  }
  const img = el("img", { src: scr.url, style: { position: "absolute", left: bez + rim + "px", top: bez + rim + "px", width: sw + "px", height: sh + "px", borderRadius: sr + "px" } }, wrap);
  el("div", { style: { position: "absolute", left: bez + rim + "px", top: bez + rim + "px", width: sw + "px", height: sh + "px", borderRadius: sr + "px",
    background: "linear-gradient(118deg, rgba(255,255,255,0.00) 38%, rgba(255,255,255,0.035) 38.2%, rgba(255,255,255,0.0) 62%)", pointerEvents: "none" } }, wrap);
  const off = bez + rim;
  return { el: wrap, img, k, sx: x, sy: y, sw, sh, ow, oh, off,
    map: (cx, cy) => [x + cx * k, y + (cy + scr.capTop) * k],            // capture px -> stage px (untilted)
    local: (cx, cy) => [off + cx * k, off + (cy + scr.capTop) * k] };    // capture px -> phone-local px
}

// ---------- icons (SF-Symbol-like, drawn for 64x64) ----------
export const IC = {
  ok: (c = C.green) => `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="${c}"/><path d="M19 33l9 9 17-19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warn: (c = C.amber) => `<svg viewBox="0 0 64 64"><path d="M28.5 8.5a4 4 0 0 1 7 0l24 42a4 4 0 0 1-3.5 6H8a4 4 0 0 1-3.5-6z" fill="${c}"/><path d="M32 23v15" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="47" r="3.6" fill="#fff"/></svg>`,
  err: (c = C.red) => `<svg viewBox="0 0 64 64"><path d="M21 4h22l17 17v22L43 60H21L4 43V21z" fill="${c}" stroke="${c}" stroke-width="4" stroke-linejoin="round"/><path d="M32 17v19" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/><circle cx="32" cy="46" r="4" fill="#fff"/></svg>`,
  signal: (c = "currentColor") => `<svg viewBox="0 0 64 64" fill="none" stroke="${c}" stroke-width="5.5" stroke-linecap="round"><circle cx="14" cy="50" r="4" fill="${c}" stroke="none"/><path d="M12 30a22 22 0 0 1 22 22"/><path d="M12 14a38 38 0 0 1 38 38"/></svg>`,
  live: (c = "#fff") => `<svg viewBox="0 0 64 64" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"><circle cx="32" cy="27" r="5" fill="${c}" stroke="none"/><path d="M32 32v22"/><path d="M21 16a15 15 0 0 0 0 22M43 16a15 15 0 0 1 0 22"/><path d="M13 9a26 26 0 0 0 0 36M51 9a26 26 0 0 1 0 36"/></svg>`,
  server: (c = "currentColor") => `<svg viewBox="0 0 64 64" fill="none" stroke="${c}" stroke-width="4.5" stroke-linejoin="round"><rect x="8" y="10" width="48" height="18" rx="5"/><rect x="8" y="36" width="48" height="18" rx="5"/><circle cx="18" cy="19" r="2.6" fill="${c}"/><circle cx="18" cy="45" r="2.6" fill="${c}"/></svg>`,
};

// Glass card: header row + rows. tone tints the glass (warm for red scenes etc.).
export function glass(parent, { x, y, w, tone = "neutral", head, rows = [], z = 30, opacity = 1, style = {} }) {
  const tones = {
    neutral: "rgba(34,34,40,0.62)", warm: "rgba(52,30,28,0.60)", violet: "rgba(36,30,56,0.60)",
    wine: "rgba(58,20,34,0.56)", teal: "rgba(18,40,44,0.60)", dark: "rgba(22,22,26,0.72)",
  };
  const g = el("div", { class: "glass", style: { left: x + "px", top: y + "px", width: w + "px", zIndex: z,
    background: tones[tone] || tone, opacity, boxShadow: "0 50px 90px -30px rgba(0,0,0,0.6)", ...style } }, parent);
  if (head) el("div", { class: "g-head" }, g, `<div class="g-title">${head.title}</div>${head.meta ? `<div class="g-meta" style="color:${head.metaColor || C.gray}">${head.meta}</div>` : ""}`);
  for (const r of rows) {
    el("div", { class: "g-row", style: r.style || {} }, g,
      `<div class="g-ic">${r.icon || ""}</div><div class="g-body"><div class="g-rt" style="${r.color ? `color:${r.color}` : ""}">${r.title}</div>${r.sub ? `<div class="g-rs">${r.sub}</div>` : ""}</div>${r.value ? `<div class="g-rv">${r.value}</div>` : ""}`);
  }
  return g;
}

// ---------- WebGL atmosphere ----------
// A full-frame shader: vertical gradient + soft warped color pools + optional fbm fog,
// vignette, film grain and triangular dither (no banding in the deep darks).
export const GLSL_LIB = `
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float a=.5, s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ s+=a*vnoise(p); p=m*p; a*=.5; } return s; }
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c,0.), vec3(1./2.2)); }
`;

export function atmosphere(stage, { top, bot, glows = [], fog = null, vignette = 0.35, grain = 0.018, extra = "", z = 0, uniforms = {} }) {
  const BW = Math.round(W * PX), BH = Math.round(H * PX);
  const cvs = el("canvas", { class: "bg", width: BW, height: BH, style: { zIndex: z } }, stage);
  const gl = cvs.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  const N = 8;
  const gs = [...glows]; while (gs.length < N) gs.push({ x: 0, y: 0, rx: 1, ry: 1, c: [0, 0, 0], a: 0 });
  const fs = `#version 300 es
  precision highp float; out vec4 o; uniform vec2 uRes;
  uniform vec3 uTop, uBot; uniform vec4 uG[${N}]; uniform vec4 uGC[${N}];
  uniform vec4 uFog; uniform vec3 uFogC; uniform float uVig, uGrain;
  ${Object.keys(uniforms).map((k) => `uniform ${Array.isArray(uniforms[k]) ? "vec" + uniforms[k].length : "float"} ${k};`).join("\n")}
  ${GLSL_LIB}
  ${extra}
  void main(){
    vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);   // px, y down
    vec2 uv = p / uRes.x;                                      // x 0..1, y 0..H/W
    float ty = p.y / uRes.y;
    vec3 c = mix(toLin(uTop), toLin(uBot), smoothstep(0., 1., ty));
    vec2 w = vec2(fbm(uv*1.3+3.1), fbm(uv*1.3+9.7)) - .5;
    for(int i=0;i<${N};i++){
      vec2 d = (uv + w*.18 - uG[i].xy) / uG[i].zw;
      c += toLin(uGC[i].rgb) * uGC[i].a * exp(-dot(d,d));
    }
    if (uFog.x > 0.) {
      float f = fbm(uv*vec2(uFog.y, uFog.y*1.6) + vec2(0., uFog.z));
      float f2 = fbm(uv*vec2(uFog.y*2.3, uFog.y*3.1) + 11.3);
      float band = smoothstep(uFog.w - .55, uFog.w, uv.y) * (1. - smoothstep(uFog.w, uFog.w + .9, uv.y));
      c += toLin(uFogC) * uFog.x * pow(f*.8 + f2*.35, 2.2) * (0.35 + 0.65*band);
    }
    #ifdef EXTRA
    c = extra(p, uv, c);
    #endif
    vec2 v = (p/uRes - .5) * vec2(1., 1.25);
    c *= 1. - uVig * smoothstep(.25, .95, length(v)*1.3);
    vec3 s = toSrgb(c);
    float g = hash12(p*1.37+17.7) + hash12(p*0.71+3.1) - 1.;
    s += g*uGrain + (hash12(p+.5) + hash12(p*1.9+7.) - 1.)/255.;
    o = vec4(s, 1.);
  }`;
  const vs = `#version 300 es
  in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const l = gl.getShaderInfoLog(sh); console.error(l); throw new Error(l); } return sh; };
  const prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, extra ? fs.replace("#ifdef EXTRA", "#define EXTRA\n#ifdef EXTRA") : fs));
  gl.bindAttribLocation(prog, 0, "a"); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  gl.uniform2f(U("uRes"), BW, BH);
  gl.uniform3fv(U("uTop"), hex(top)); gl.uniform3fv(U("uBot"), hex(bot));
  gl.uniform4fv(U("uG"), gs.flatMap((g) => [g.x, g.y, g.rx, g.ry]));
  gl.uniform4fv(U("uGC"), gs.flatMap((g) => [...hex(g.c), g.a]));
  gl.uniform4fv(U("uFog"), fog ? [fog.amount, fog.scale, fog.seed || 0, fog.y ?? 1.0] : [0, 0, 0, 0]);
  gl.uniform3fv(U("uFogC"), fog ? hex(fog.color) : [0, 0, 0]);
  gl.uniform1f(U("uVig"), vignette); gl.uniform1f(U("uGrain"), grain);
  for (const [k, v] of Object.entries(uniforms)) { const l = U(k); if (!l) continue; Array.isArray(v) ? gl[`uniform${v.length}fv`](l, v) : gl.uniform1f(l, v); }
  gl.viewport(0, 0, BW, BH); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
  return cvs;
}

// Translucent fbm fog wisps as their own layer (sits in front of scenery, behind cards).
export function fogOverlay(stage, { color = "#c0281e", amount = 0.6, scale = 2.4, seed = 1, y0 = 0.5, y1 = 2.0, z = 9, stretch = 2.6 }) {
  const BW = Math.round(W * PX), BH = Math.round(H * PX);
  const cvs = el("canvas", { class: "bg", width: BW, height: BH, style: { zIndex: z } }, stage);
  const gl = cvs.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: true, alpha: true });
  const fs = `#version 300 es
  precision highp float; out vec4 o; uniform vec2 uRes; uniform vec3 uC; uniform float uA, uS, uSeed, uY0, uY1, uStr;
  ${GLSL_LIB}
  void main(){
    vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); vec2 uv = p / uRes.x;
    vec2 q = uv * vec2(uS, uS * uStr) + vec2(uSeed, uSeed * .7);
    vec2 w = vec2(fbm(q * .7 + 1.7), fbm(q * .7 + 8.3));
    float f = fbm(q + 1.8 * w);
    float d = smoothstep(.42, .85, f);
    float band = smoothstep(uY0, uY0 + .35, uv.y) * (1. - smoothstep(uY1 - .35, uY1, uv.y));
    float a = clamp(d * band * uA, 0., 1.);
    a += (hash12(p) - .5) / 255.;
    o = vec4(uC * a, a);
  }`;
  const vs = `#version 300 es
  in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, "a"); gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  gl.uniform2f(U("uRes"), BW, BH); gl.uniform3fv(U("uC"), hex(color));
  gl.uniform1f(U("uA"), amount); gl.uniform1f(U("uS"), scale); gl.uniform1f(U("uSeed"), seed);
  gl.uniform1f(U("uY0"), y0); gl.uniform1f(U("uY1"), y1); gl.uniform1f(U("uStr"), stretch);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.viewport(0, 0, BW, BH); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
  return cvs;
}

export function hex(h) {
  if (Array.isArray(h)) return h;
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// ---------- line icons (64-unit grid, one stroke weight) ----------
const LS = (sw = 4.2) => `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
export const LINE_ICONS = {
  lookup: (sw) => `<defs><mask id="m1"><rect width="64" height="64" fill="#fff"/><circle cx="43" cy="43" r="14.5" fill="#000"/></mask></defs>
    <g ${LS(sw)}><g mask="url(#m1)"><rect x="9" y="7" width="36" height="46" rx="7"/><path d="M17 19h20M17 28h20M17 37h12"/></g>
    <circle cx="43" cy="43" r="10"/><path d="M50.5 50.5l6.5 6.5"/></g>`,
  score: (sw) => `<g ${LS(sw)}><path d="M32 8a24 24 0 1 1-22.8 16.6"/><path d="M13.2 17.6A24 24 0 0 1 24.6 9.2" opacity=".4" stroke-dasharray="0.1 7"/>
    <rect x="20" y="24" width="24" height="17" rx="3.5"/><path d="M21 26l11 8 11-8"/></g>`,
  ptr: (sw) => `<g ${LS(sw)}><path d="M50 26A19 19 0 0 0 15.5 21.5"/><path d="M14 13v9h9"/><path d="M14 38a19 19 0 0 0 34.5 4.5"/><path d="M50 51v-9h-9"/></g>`,
  transcript: (sw) => `<g ${LS(sw)}><rect x="6" y="11" width="52" height="42" rx="8"/><path d="M16 26l7 6-7 6"/><path d="M29 40h14"/></g>`,
  tls: (sw) => `<g ${LS(sw)}><rect x="13" y="28" width="38" height="28" rx="6"/><path d="M21 28v-8a11 11 0 0 1 22 0v8"/><path d="M32 38v8"/></g>`,
  relay: (sw) => `<defs><mask id="m2"><rect width="64" height="64" fill="#fff"/><circle cx="46" cy="44" r="15" fill="#000"/></mask></defs>
    <g ${LS(sw)}><g mask="url(#m2)"><rect x="5" y="12" width="44" height="32" rx="5"/><path d="M6.5 14.5L27 30l20.5-15.5"/></g>
    <circle cx="46" cy="44" r="10.5"/><path d="M38.6 51.4l14.8-14.8"/></g>`,
  blacklist: (sw) => `<g ${LS(sw)}><path d="M22 6h20l14 14v20L42 54H22L8 40V20z" transform="translate(0 2)"/><path d="M32 20v16"/></g><circle cx="32" cy="45" r="2.8" fill="currentColor"/>`,
  globe: (sw) => `<g ${LS(sw)}><circle cx="32" cy="32" r="24"/><ellipse cx="32" cy="32" rx="10" ry="24"/><path d="M9 24h46M9 40h46"/></g>`,
  history: (sw) => `<g ${LS(sw)}><path d="M10.5 36A22 22 0 1 0 14 19"/><path d="M8 11v10h10"/><path d="M33 21v12l8 5"/></g>`,
  library: (sw) => `<g ${LS(sw)}><circle cx="14" cy="16" r="5.5"/><circle cx="14" cy="32" r="5.5"/><circle cx="14" cy="48" r="5.5"/><path d="M29 16h26M29 32h26M29 48h18"/></g>`,
};
Object.assign(LINE_ICONS, {
  compare: (sw) => `<g ${LS(sw)}><rect x="6" y="10" width="22" height="44" rx="5"/><rect x="36" y="10" width="22" height="44" rx="5"/><path d="M12 22h10M12 30h10M42 22h10M42 30h10M42 38h6"/></g>`,
  spf: (sw) => `<defs><mask id="m3"><rect width="64" height="64" fill="#fff"/><circle cx="46" cy="44" r="15" fill="#000"/></mask></defs>
    <g ${LS(sw)}><g mask="url(#m3)"><rect x="5" y="12" width="44" height="32" rx="5"/><path d="M6.5 14.5L27 30l20.5-15.5"/></g>
    <circle cx="46" cy="44" r="10.5"/><path d="M41.5 44.5l3.3 3.3 6-6.6"/></g>`,
  dkim: (sw) => `<g ${LS(sw)}><circle cx="20" cy="32" r="14"/><circle cx="20" cy="32" r="4"/><path d="M34 32h24M50 32v11M58 32v8"/></g>`,
  resolvers: (sw) => `<g ${LS(sw)}><rect x="8" y="8" width="48" height="14" rx="4"/><rect x="8" y="25" width="48" height="14" rx="4"/><rect x="8" y="42" width="48" height="14" rx="4"/><path d="M16 15h.5M16 32h.5M16 49h.5M26 15h20M26 32h20M26 49h20"/></g>`,
  map: (sw) => `<g ${LS(sw)}><path d="M6 14l16-6 20 7 16-6v41l-16 6-20-7-16 6z"/><path d="M22 8v41M42 15v41"/></g>`,
  monitor: (sw) => `<g ${LS(sw)}><rect x="6" y="10" width="52" height="44" rx="9"/><path d="M13 33h9l5-11 8 22 5-11h11"/></g>`,
  stopwatch: (sw) => `<g ${LS(sw)}><circle cx="32" cy="36" r="22"/><path d="M32 36V24M26 6h12M32 6v8M50 16l4-4"/></g>`,
  bell: (sw) => `<g ${LS(sw)}><path d="M16 44V29a16 16 0 0 1 32 0v15l4 5H12z"/><path d="M26 54a6 6 0 0 0 12 0"/><path d="M32 8v5"/></g>`,
});
export function lineIcon(k, { size = 140, color = "#e6d6ff", sw = 4.2 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" style="color:${color};overflow:visible">${LINE_ICONS[k](sw).replaceAll("currentColor", color)}</svg>`;
}

// Film grain as its own layer (for areas drawn by layers that carry no grain, e.g. three.js renders).
export function grain(stage, { z = 12, amount = 0.10, seed = 7 } = {}) {
  const c = el("canvas", { width: Math.round(W * PX), height: Math.round(H * PX), class: "abs", style: { left: 0, top: 0, width: W + "px", height: H + "px", zIndex: z,
    mixBlendMode: "overlay", opacity: String(amount), pointerEvents: "none" } }, stage);
  const x = c.getContext("2d"); const img = x.createImageData(c.width, c.height); const d = img.data;
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < d.length; i += 4) { const v = 128 + (rnd() + rnd() - 1) * 127; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  return c;
}
