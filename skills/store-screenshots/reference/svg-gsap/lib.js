// Shared building blocks for the c-svg direction: vector device, lifted capture regions,
// vector rings/chips, dotted map. Stage is always 1260x2736; video pages scale it.
export const CAP = { W: 2428, H: 5275 };
export const C = {
  blue: "#2563EB", blueDeep: "#1D4ED8", ink: "#0B1220", green: "#10B981", mint: "#34D399",
  yellow: "#FFD23F", amber: "#F59E0B", cream: "#FFF8E6", white: "#FFFFFF",
};
const SVGNS = "http://www.w3.org/2000/svg";

export function h(tag, attrs = {}, parent, html) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else n.setAttribute(k, v);
  }
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}
export function s(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
export function svgLayer(parent, w = 1260, hgt = 2736, z = 0) {
  return s("svg", { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`,
    style: `position:absolute;left:0;top:0;z-index:${z};overflow:visible` }, parent);
}

export function loadImages(srcs) {
  return Promise.all(srcs.map((src) => new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
  })));
}

// Vector device: dark titanium body, bezel, side buttons. The capture's own alpha gives the
// screen shape; a black backing fills the dynamic island hole.
export function device(parent, { src, x, y, w, z = 5, id = "dev" }) {
  const bez = Math.round(w * 0.024);
  const sw = w - bez * 2, sh = sw * CAP.H / CAP.W;
  const H = sh + bez * 2;
  const r = w * 0.165;
  const wrap = h("div", { class: "device", style: { position: "absolute", left: x + "px", top: y + "px",
    width: w + "px", height: H + "px", zIndex: z } }, parent);
  const svg = s("svg", { width: w + 16, height: H, viewBox: `-8 0 ${w + 16} ${H}`,
    style: "position:absolute;left:-8px;top:0;overflow:visible" }, wrap);
  const defs = s("defs", {}, svg);
  const g1 = s("linearGradient", { id: id + "-rim", x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  s("stop", { offset: 0, "stop-color": "#5B6475" }, g1);
  s("stop", { offset: 0.35, "stop-color": "#20242C" }, g1);
  s("stop", { offset: 0.7, "stop-color": "#15181E" }, g1);
  s("stop", { offset: 1, "stop-color": "#4A5263" }, g1);
  // side buttons
  const btn = (bx, by, bh) => s("rect", { x: bx, y: by, width: 7, height: bh, rx: 3, fill: "#2A2F39" }, svg);
  btn(-6, H * 0.17, H * 0.045); btn(-6, H * 0.235, H * 0.075); btn(-6, H * 0.325, H * 0.075); btn(w - 1, H * 0.265, H * 0.11);
  s("rect", { x: 0, y: 0, width: w, height: H, rx: r, fill: `url(#${id}-rim)` }, svg);
  s("rect", { x: 3, y: 3, width: w - 6, height: H - 6, rx: r - 3, fill: "#07080B" }, svg);
  s("rect", { x: bez - 1, y: bez - 1, width: sw + 2, height: sh + 2, rx: r - bez, fill: "#000" }, svg);
  const img = s("image", { href: src, x: bez, y: bez, width: sw, height: sh, preserveAspectRatio: "none" }, svg);
  const k = sw / CAP.W;
  return {
    el: wrap, img, x, y, w, h: H, k, sx: x + bez, sy: y + bez, sw, sh,
    // capture px -> stage px
    map: (cx, cy) => [x + bez + cx * k, y + bez + cy * k],
  };
}

// Lift a capture region out of the device: a card with real pixels, scaled around its centre.
export function lift(parent, dev, { src, region, scale = 1.25, dx = 0, dy = 0, radius = 60, z = 10, shadow = "soft", bg = "#fff" }) {
  const [x0, y0, x1, y1] = region;
  const k = dev.k * scale;
  const w = (x1 - x0) * k, hgt = (y1 - y0) * k;
  const [mx, my] = dev.map((x0 + x1) / 2, (y0 + y1) / 2);
  const left = mx - w / 2 + dx, top = my - hgt / 2 + dy;
  const shadows = {
    soft: "0 60px 90px -20px rgba(8,16,48,.45), 0 18px 36px -8px rgba(8,16,48,.30), 0 0 0 1px rgba(255,255,255,.6)",
    warm: "0 60px 90px -20px rgba(80,50,0,.40), 0 18px 36px -8px rgba(80,50,0,.28), 0 0 0 1px rgba(255,255,255,.7)",
    deep: "0 70px 100px -20px rgba(0,30,20,.50), 0 20px 40px -8px rgba(0,30,20,.30), 0 0 0 1px rgba(255,255,255,.6)",
  };
  const card = h("div", { class: "lift", style: { position: "absolute", left: left + "px", top: top + "px",
    width: w + "px", height: hgt + "px", borderRadius: radius * k + "px", overflow: "hidden", zIndex: z,
    boxShadow: shadows[shadow] || shadow, background: bg } }, parent);
  h("img", { src, style: { position: "absolute", left: -x0 * k + "px", top: -y0 * k + "px",
    width: CAP.W * k + "px", height: CAP.H * k + "px", maxWidth: "none" } }, card);
  return { el: card, left, top, w, h: hgt, k, map: (cx, cy) => [left + (cx - x0) * k, top + (cy - y0) * k] };
}

// Text block: eyebrow + headline + subline.
export function headline(parent, { eyebrow, lines, sub, x = 96, y = 170, color = "#fff", accent, size = 136, subColor, width = 1080 }) {
  const box = h("div", { class: "hl", style: { position: "absolute", left: x + "px", top: y + "px", width: width + "px", zIndex: 30, color } }, parent);
  const eb = eyebrow ? h("div", { class: "eyebrow", style: { color: accent || color } }, box, eyebrow) : null;
  const h1 = h("h1", { style: { fontSize: size + "px" } }, box);
  const lineEls = lines.map((l) => h("span", { class: "line" }, h1, `<span class="li">${l}</span>`));
  const p = sub ? h("p", { class: "sub", style: { color: subColor || color } }, box, sub) : null;
  return { box, eb, lines: lineEls.map((l) => l.firstChild), sub: p };
}

// Arc path for a ring from angle a0 to a1 (degrees, 0 = 12 o'clock, clockwise).
export function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export const FONT_CSS = `
@font-face{font-family:Inter;font-weight:400;src:url(/fonts/Inter-Regular.ttf)}
@font-face{font-family:Inter;font-weight:700;src:url(/fonts/Inter-Bold.ttf)}
@font-face{font-family:Inter;font-weight:800;src:url(/fonts/Inter-ExtraBold.ttf)}
@font-face{font-family:Poppins;font-weight:900;src:url(/fonts/Poppins-Black.ttf)}
@font-face{font-family:Poppins;font-weight:800;src:url(/fonts/Poppins-ExtraBold.ttf)}
`;
