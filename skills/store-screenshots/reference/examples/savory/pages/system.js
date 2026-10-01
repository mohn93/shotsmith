// Savory "Sunday Supplement": cream paper (GLSL), SVG food art, a serif headline with an italic accent line.
// Layout is in the kit's 1260-wide logical stage. Words come from claims.json only (t, t.el, headline).
import { headline, t } from "shotsmith/kit";

export const C = {
  paper: "#FCF3E4", tomato: "#E45D3F", tomatoDeep: "#C73D2D", folio: "#B83A2A", ink: "#3F2924", cocoa: "#7A5E54",
  butter: "#F8E3C0", mustard: "#F8C46D", sage: "#E9EDDA", basil: "#4E955E", peach: "#FCE6D2", app: "#FFF8F0",
};

export function el(tag, attrs = {}, parent, html) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else n.setAttribute(k, v);
  }
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}
export function box(parent, css, html) {
  const n = el("div", {}, parent, html);
  n.style.cssText = "position:absolute;" + css;
  return n;
}
const NS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
export function svgLayer(st, z = 5) {
  return s("svg", { width: st.W, height: st.H, viewBox: `0 0 ${st.W} ${st.H}`, style: `position:absolute;left:0;top:0;z-index:${z};overflow:visible` }, st.root);
}
export function rng(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

// ---------- paper (GLSL) ----------
// mode 0: full paper (base color, fibers, tooth, light falloff, vignette, grain, dither).
// mode 1: texture only, near white, for a multiply layer that prints the paper into the art above it.
// Keep it below device frames: glass carries no paper fibres.
export function paper(st, { base = C.paper, light = 0.05, vignette = 0.10, fiber = 1, mode = 0, z = 0, opacity = 1, seed = 3 } = {}) {
  const PX = st.scale, BW = Math.round(st.W * PX), BH = Math.round(st.H * PX);
  const cvs = el("canvas", { width: BW, height: BH }, st.root);
  cvs.style.cssText = `position:absolute;left:0;top:0;width:${st.W}px;height:${st.H}px;z-index:${z};mix-blend-mode:${mode ? "multiply" : "normal"};opacity:${opacity};pointer-events:none`;
  const gl = cvs.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  const fs = `#version 300 es
  precision highp float; out vec4 o;
  uniform vec2 uRes; uniform vec3 uBase; uniform float uLight, uVig, uFiber, uMode, uSeed, uPX;
  float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(h12(i),h12(i+vec2(1,0)),u.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),u.x),u.y); }
  float fbm(vec2 p){ float a=.5,s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ s+=a*vn(p); p=m*p; a*=.5; } return s; }
  mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
  vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
  void main(){
    vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPX;   // logical px, y down
    vec2 q = p / 1260.;
    float f = 0.;                                                  // fibers: long thin streaks, low contrast
    for (int k=0;k<3;k++){
      vec2 r = rot(float(k)*1.9 + uSeed) * p;
      float n = vn(r * vec2(0.012, 0.22) + float(k)*17.);
      f += smoothstep(.78, .98, n) * (.55 - .12*float(k));
    }
    float cloud = fbm(q * 7. + uSeed) - .5;                        // pulp density
    float tooth = vn(p * .55) - .5;                                // fine tooth
    float shade = 1. - uFiber * (.030 * f) + cloud * .030 * uFiber + tooth * .018 * uFiber;
    vec3 c = lin(uBase);
    if (uMode > .5) c = vec3(1.);
    c *= shade;
    float L = 1. + uLight * (1. - smoothstep(0., 1.5, length(q - vec2(.1, .05))));   // light from the top left
    c *= L;
    vec2 v = (gl_FragCoord.xy / uRes - .5) * vec2(1., 1.1);
    c = mix(c, c * lin(vec3(.93, .86, .78)), uVig * 8. * smoothstep(.3, .95, length(v) * 1.25));   // warm vignette
    vec3 sR = pow(max(c, 0.), vec3(1./2.2));
    float g = h12(gl_FragCoord.xy*1.37+17.7) + h12(gl_FragCoord.xy*.71+3.1) - 1.;
    sR += g * .010 + (h12(gl_FragCoord.xy+.5) + h12(gl_FragCoord.xy*1.9+7.) - 1.)/255.;   // grain and dither
    o = vec4(sR, 1.);
  }`;
  const vs = `#version 300 es
  in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;
  const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, "a"); gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  gl.uniform2f(U("uRes"), BW, BH); gl.uniform3fv(U("uBase"), hex(base));
  gl.uniform1f(U("uLight"), light); gl.uniform1f(U("uVig"), vignette); gl.uniform1f(U("uFiber"), fiber);
  gl.uniform1f(U("uMode"), mode); gl.uniform1f(U("uSeed"), seed); gl.uniform1f(U("uPX"), PX);
  gl.viewport(0, 0, BW, BH); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
  return cvs;
}

// ---------- line icons (64 grid, round caps) ----------
export const ICON = {
  search: `<circle cx="28" cy="28" r="15"/><path d="M39 39l12 12"/>`,
  clock: `<circle cx="32" cy="32" r="21"/><path d="M32 19v14l9 6"/>`,
  calendar: `<rect x="10" y="14" width="44" height="40" rx="7"/><path d="M10 26h44M22 9v10M42 9v10"/><circle cx="32" cy="39" r="3.2" fill="currentColor" stroke="none"/>`,
  bolt: `<path d="M35 8L16 36h14l-3 20 19-28H32z"/>`,
  leaf: `<path d="M14 50C14 26 28 12 52 12c0 24-14 38-38 38z"/><path d="M14 50L36 28"/>`,
  plate: `<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="12"/>`,
  heart: `<path d="M32 52S10 39 10 24a11 11 0 0 1 22-4 11 11 0 0 1 22 4c0 15-22 28-22 28z"/>`,
  list: `<path d="M24 20h24M24 32h24M24 44h24"/><circle cx="15" cy="20" r="2.5" fill="currentColor"/><circle cx="15" cy="32" r="2.5" fill="currentColor"/><circle cx="15" cy="44" r="2.5" fill="currentColor"/>`,
};
export const icon = (k, { size = 64, color = "#fff", sw = 4.5 } = {}) =>
  `<svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;color:${color}">${ICON[k]}</svg>`;

// ---------- type ----------
// Folio eyebrow: a short rule and the claim in tracked capitals.
export function folio(parent, id, { color = C.folio, size = 38, css = "" } = {}) {
  const row = box(parent, `display:flex;align-items:center;gap:22px;color:${color};z-index:40;${css}`);
  box(row, "position:relative;flex:none;width:64px;height:4px;background:currentColor");
  const label = t.el("span", id, row);
  label.style.cssText = `font:700 ${size}px/1 var(--font-text);letter-spacing:.2em;text-transform:uppercase;white-space:nowrap`;
  return row;
}

// The headline's last line in the italic cut (and an accent color): the magazine's second voice.
// The claim's own line breaks decide the lines, so the text stays exactly the claim.
export function accentLast(h, color) {
  const nodes = [...h.childNodes];
  const i = nodes.findLastIndex((n) => n.nodeName === "BR");
  if (i < 0) return;
  const span = el("span", {}, null);
  span.style.cssText = `font-family:var(--font-display-italic);letter-spacing:-0.01em;${color ? `color:${color}` : ""}`;
  for (const n of nodes.slice(i + 1)) span.appendChild(n);
  h.appendChild(span);
}

// Inner-screen title block: folio eyebrow, serif headline fitted by the kit (lines from the claim), subline from its bottom.
export async function title(st, { eyebrow, id, sub, top = 150, size = 140, color = C.ink, accent = C.tomato, ebColor = C.folio,
  subColor = C.cocoa, subSize = 54, M = 100, maxW = 1060, ebSize = 38 }) {
  folio(st.root, eyebrow, { color: ebColor, size: ebSize, css: `left:${M}px;top:${top}px` });
  const h = box(st.root, `left:${M - 5}px;top:${top + ebSize + 42}px;width:${maxW}px;z-index:40;color:${color};font-family:var(--font-display);font-weight:600;letter-spacing:-0.022em`);
  const lines = t(id).split("\n").length;
  const fit = await headline(h, id, { maxSize: size, maxLines: lines, lineHeight: 1.02 });
  accentLast(h, accent);
  let bottom = fit.bottom, p = null;
  if (sub) {
    p = t.el("div", sub, st.root);
    p.style.cssText = `position:absolute;left:${M}px;top:${fit.bottom + 34}px;width:${maxW}px;z-index:40;font:400 ${subSize}px/1.28 var(--font-text);color:${subColor};letter-spacing:-0.005em;text-wrap:pretty`;
    bottom = p.getBoundingClientRect().bottom / st.scale;
  }
  return { h, p, fit, bottom };
}

// ---------- devices ----------
// Warm layered shadow under a kit device frame (device({ shadow: false })), following its transform.
export function warmShadow(st, d, { color = "63,41,36", a = 1 } = {}) {
  const f = d.el.style;
  const off = parseFloat(d.screen.style.left), r = parseFloat(d.screen.style.borderRadius) + off;
  const n = box(st.root, `left:${f.left};top:${f.top};width:${f.width};height:${f.height};border-radius:${r}px;z-index:${Number(f.zIndex) - 1};` +
    `box-shadow:0 3px 6px rgba(${color},${0.18 * a}), 0 30px 50px -18px rgba(${color},${0.30 * a}), 0 90px 140px -40px rgba(${color},${0.34 * a})`);
  if (f.transform) { n.style.transform = f.transform; n.style.transformOrigin = f.transformOrigin; }
  return n;
}

// Reshape a kit lift() card: clip it to shapes (capture px; rects with a corner radius, circles) instead of one
// rounded rectangle, and give it a soft warm drop shadow that follows the shapes. `region` and `inset` are the
// ones passed to lift(). Used where a card has a plate overhanging it, or where a row of tiles lifts as one.
export async function shapeLift(st, card, { region, inset = 2, shapes, shadow }) {
  const [x0, y0, x1, y1] = region, w = x1 - x0 - 2 * inset, h = y1 - y0 - 2 * inset, ox = x0 + inset, oy = y0 + inset;
  const sv = shapes.map((sh) => sh.rect
    ? `<rect x="${sh.rect[0] - ox}" y="${sh.rect[1] - oy}" width="${sh.rect[2] - sh.rect[0]}" height="${sh.rect[3] - sh.rect[1]}" rx="${sh.r}" fill="#fff"/>`
    : `<circle cx="${sh.circle[0] - ox}" cy="${sh.circle[1] - oy}" r="${sh.circle[2]}" fill="#fff"/>`).join("");
  const data = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${sv}</svg>`)}`;
  const url = `url("${data}")`;
  Object.assign(card.style, { borderRadius: "0", boxShadow: "none", webkitMaskImage: url, maskImage: url, webkitMaskSize: "100% 100%", maskSize: "100% 100%" });
  // The mask would clip a shadow on the card itself, so the shadow goes on a wrapper.
  const wrap = el("div", {}, null);
  wrap.style.cssText = `position:absolute;left:0;top:0;width:${st.W}px;height:${st.H}px;z-index:${card.style.zIndex};filter:${shadow};pointer-events:none`;
  card.parentNode.insertBefore(wrap, card);
  wrap.appendChild(card);
  return wrap;
}
