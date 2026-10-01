// Daily Arc "Bright Streak": flat color blocks, chunky rounded type, flat "3D button" edges, SVG ornaments.
// Layout is in the kit's 1260-wide logical stage. Words come from claims.json only (t, t.el, headline).
import { headline, t } from "shotsmith/kit";

export const C = {
  sunshine: "#FFC83D", sunshineShade: "#E9A21C",
  sprout: "#34C38F", peach: "#FF8B5E", sky: "#4D8DF7", grape: "#8C6CF2",
  ink: "#172B34", white: "#FFFFFF",
  green: "#278875", greenDeep: "#1C6456", mint: "#DCEEE7", mintEdge: "#A9D3C4",
  sunOrange: "#F4A340", sunBrown: "#A76B24",
};

const SVGNS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
export function box(parent, css, html) {
  const n = document.createElement("div");
  n.style.cssText = "position:absolute;" + css;
  if (html != null) n.innerHTML = html;
  parent.appendChild(n);
  return n;
}
export function svgLayer(st, z = 1) {
  return s("svg", { width: st.W, height: st.H, viewBox: `0 0 ${st.W} ${st.H}`, style: `position:absolute;left:0;top:0;z-index:${z};overflow:visible` }, st.root);
}

// Headline (fitted by the kit) and an optional subline placed from the headline's bottom.
export async function title(st, id, { x = 88, y = 150, width = st.W - x - 60, size, maxLines = 3, color = C.ink, sub, subColor, subSize = 54, subGap = 44, subWidth = 900 }) {
  const h = box(st.root, `left:${x}px;top:${y}px;width:${width}px;z-index:40;color:${color};font-family:var(--font-display);font-weight:700;letter-spacing:-0.01em;text-wrap:balance`);
  const fit = await headline(h, id, { maxSize: size, maxLines, lineHeight: 0.98 });
  let bottom = fit.bottom, p = null;
  if (sub) {
    p = t.el("div", sub, st.root);
    p.style.cssText = `position:absolute;left:${x}px;top:${fit.bottom + subGap}px;width:${subWidth}px;z-index:40;color:${subColor || color};font:800 ${subSize}px/1.22 var(--font-text);letter-spacing:-0.005em;text-wrap:pretty`;
    bottom = p.getBoundingClientRect().bottom / st.scale;
  }
  return { h, p, fit, bottom };
}

// Line boxes of an element's text in logical px, one per rendered line.
export function lineBoxes(st, el) {
  const r = document.createRange(); r.selectNodeContents(el);
  return [...r.getClientRects()].filter((b) => b.width > 0).map((b) => ({ l: b.left / st.scale, r: b.right / st.scale, t: b.top / st.scale, b: b.bottom / st.scale }));
}

// Flat offset "block" under a kit device frame, plus a soft ambient shadow: the set's 3D-button look.
export function blockShadow(st, d, { dx = 0, dy, color, ambient = "rgba(60,40,0,0.45)" }) {
  const off = parseFloat(d.screen.style.left);
  const r = parseFloat(d.screen.style.borderRadius) + off;
  const f = d.el.style;
  const n = box(st.root, `left:${f.left};top:${f.top};width:${f.width};height:${f.height};border-radius:${r}px;z-index:${Number(f.zIndex) - 1};` +
    `box-shadow:${dx}px ${dy}px 0 ${color}, 0 60px 110px -40px ${ambient}, 0 24px 50px -24px ${ambient}`);
  if (f.transform) { n.style.transform = f.transform; n.style.transformOrigin = f.transformOrigin; }
  return n;
}

// A capture region as a free-standing card (no phone), drawn on a canvas. w in stage px, rotated about its centre.
// at(cx, cy) maps capture px to card-local px for badges placed on the card.
export function crop(st, img, { region, x, y, w, rotate = 0, radius, edge = null, edgeH = 20, z = 20, shadow = "rgba(20,40,30,0.35)" }) {
  const [x0, y0, x1, y1] = region;
  const k = w / (x1 - x0), h = (y1 - y0) * k;
  const wrap = box(st.root, `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${z};${rotate ? `transform:rotate(${rotate}deg)` : ""}`);
  const sh = [];
  if (edge) sh.push(`0 ${edgeH}px 0 ${edge}`);
  sh.push(`0 60px 80px -36px ${shadow}`, `0 24px 30px -20px ${shadow}`);
  const face = box(wrap, `inset:0;border-radius:${radius * k}px;overflow:hidden;box-shadow:${sh.join(",")}`);
  const c = document.createElement("canvas");
  c.width = x1 - x0; c.height = y1 - y0;
  c.getContext("2d").drawImage(img, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  c.style.cssText = "display:block;width:100%;height:100%";
  face.appendChild(c);
  return { el: wrap, k, w, h, at: (cx, cy) => [(cx - x0) * k, (cy - y0) * k] };
}

// ---------- ornaments (SVG shapes, no text) ----------
export function arcPath(cx, cy, r, a0, a1) {   // degrees, 0 = 12 o'clock, clockwise
  const p = (a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
  const [xa, ya] = p(a0), [xb, yb] = p(a1);
  return `M${xa} ${ya} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${xb} ${yb}`;
}
export function sparkle(g, x, y, r, fill) {
  s("path", { d: `M${x} ${y - r} Q${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y} Q${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r} Q${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y} Q${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r}Z`, fill }, g);
}
export function sun(g, x, y, r, fill, ray) {
  s("circle", { cx: x, cy: y, r, fill }, g);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    s("line", { x1: x + Math.cos(a) * r * 1.45, y1: y + Math.sin(a) * r * 1.45, x2: x + Math.cos(a) * r * 1.9, y2: y + Math.sin(a) * r * 1.9,
      stroke: ray, "stroke-width": r * 0.28, "stroke-linecap": "round" }, g);
  }
}
export function squiggle(g, x, y, w, amp, stroke, sw) {
  const n = 4, step = w / n; let d = `M${x} ${y}`;
  for (let i = 0; i < n; i++) d += ` q${step / 2} ${i % 2 ? amp : -amp} ${step} 0`;
  s("path", { d, fill: "none", stroke, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
}

// Chunky check badge centred at (x, y) inside parent.
export function checkBadge(parent, x, y, r, { fill = C.green, edge = C.greenDeep, ring = C.white, z = 5 } = {}) {
  const pad = r * 0.3, size = 2 * (r + pad);
  const svg = s("svg", { width: size, height: size + r * 0.2, viewBox: `${-r - pad} ${-r - pad} ${size} ${size + r * 0.2}`,
    style: `position:absolute;left:${x - r - pad}px;top:${y - r - pad}px;z-index:${z};overflow:visible` }, parent);
  s("circle", { cx: 0, cy: r * 0.14, r: r + r * 0.12, fill: edge }, svg);
  s("circle", { cx: 0, cy: 0, r: r + r * 0.12, fill: ring }, svg);
  s("circle", { cx: 0, cy: 0, r, fill }, svg);
  s("path", { d: `M${-r * 0.42} ${r * 0.02} L${-r * 0.1} ${r * 0.34} L${r * 0.46} ${-r * 0.3}`, fill: "none", stroke: C.white,
    "stroke-width": r * 0.26, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
  return svg;
}

// Chunky pill with a flat 3D edge; its words are the claim `id`, with an optional SVG icon before them.
export function pill(parent, id, { x = 0, y = 0, h = 120, pad = 46, bg = C.green, edge = C.greenDeep, color = C.white, font = "700 64px var(--font-display)", rotate = 0, z = 30, icon = "", lineHeight = 1, radius }) {
  const p = box(parent, `left:${x}px;top:${y}px;min-height:${h}px;padding:0 ${pad}px;border-radius:${radius ?? h / 2}px;background:${bg};color:${color};font:${font};line-height:${lineHeight};` +
    `display:flex;align-items:center;gap:22px;z-index:${z};box-shadow:0 ${Math.round(h * 0.12)}px 0 ${edge}, 0 40px 60px -30px rgba(0,0,0,0.30);${rotate ? `transform:rotate(${rotate}deg)` : ""}`, icon);
  const label = t.el("span", id, p);
  return { el: p, label };
}

export const ICONS = {
  flame: (c = "#FF7A2E", inner = "#FFC83D") => `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M32 4c4 12 18 18 18 34a18 18 0 0 1-36 0c0-9 5-14 9-19 1 6 3 9 7 10-2-9-1-17 2-25z" fill="${c}"/><path d="M32 30c3 6 9 9 9 17a9 9 0 0 1-18 0c0-5 3-8 5-10 1 3 2 4 4 5-1-4-1-8 0-12z" fill="${inner}"/></svg>`,
  clock: (size, color = "#fff") => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" style="flex:none"><circle cx="32" cy="32" r="26" fill="none" stroke="${color}" stroke-width="7"/><path d="M32 18v15l9 6" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
