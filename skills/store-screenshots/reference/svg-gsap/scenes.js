import { gsap } from "gsap";
import { C, h, s, svgLayer, device, lift, headline, arcPath } from "./lib.js";
let SRC = (n) => `/inputs/${n}.png`;
export const setSrc = (f) => { SRC = f; };

// ---------- Scene 1: domain health score (blue) ----------
export function scene1(stage) {
  const root = h("div", { class: "scene", style: { background: C.blue } }, stage);
  const bg = svgLayer(root, 1260, 2736, 1);
  const dev = device(root, { src: SRC(1), x: 180, y: 900, w: 900, id: "d1" });
  const card = lift(root, dev, { src: SRC(1), region: [112, 1404, 2318, 2776], scale: 1.28, radius: 64 });
  // ring centred on the card's score ring
  const [cx, cy] = card.map(1215, 2080);
  const R = 610;
  s("circle", { cx, cy, r: R, fill: "none", stroke: "#fff", "stroke-opacity": 0.13, "stroke-width": 120 }, bg);
  const arc = s("path", { d: arcPath(cx, cy, R, 0, 288), fill: "none", stroke: C.mint, "stroke-width": 120, "stroke-linecap": "round" }, bg);
  for (const rr of [820, 1010, 1200]) s("circle", { cx, cy, r: rr, fill: "none", stroke: "#fff", "stroke-opacity": 0.08, "stroke-width": 3 }, bg);
  const hl = headline(root, { eyebrow: `<span class="dot" style="background:${C.mint}"></span>Domain health`,
    lines: ["Know your", "domain’s health"], sub: "One score for DNS and email health." });

  const tl = gsap.timeline({ paused: true });
  const len = arc.getTotalLength();
  gsap.set(arc, { strokeDasharray: len, strokeDashoffset: len, opacity: 0 });
  tl.from(hl.eb, { y: 30, opacity: 0, duration: 0.4, ease: "power3.out" }, 0)
    .from(hl.lines, { yPercent: 110, duration: 0.7, stagger: 0.08, ease: "power4.out" }, 0.05)
    .from(hl.sub, { y: 30, opacity: 0, duration: 0.5, ease: "power3.out" }, 0.3)
    .from(dev.el, { y: 700, duration: 0.9, ease: "power4.out" }, 0.15)
    .from(card.el, { y: 700, scale: 1 / 1.28, duration: 0.9, ease: "power4.out" }, 0.15)
    .set(arc, { opacity: 1 }, 0.5).to(arc, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, 0.5);
  return { root, tl, dev, card, arc };
}

// ---------- Scene 2: mail server diagnostics (yellow) ----------
const ROWS2 = {
  dns: [150, 1505, 2290, 1770], ptr: [150, 1760, 2290, 2025], match: [150, 2015, 2290, 2365],
  smtp: [150, 2360, 2290, 2705], tls: [150, 2700, 2290, 2955], relay: [150, 2950, 2290, 3205],
};
function badge(parent, { x, y, r = 58, kind }) {
  const fill = kind === "ok" ? C.green : C.amber;
  const svg = s("svg", { width: r * 2 + 20, height: r * 2 + 20, viewBox: `-10 -10 ${r * 2 + 20} ${r * 2 + 20}`,
    style: `position:absolute;left:${x - r - 10}px;top:${y - r - 10}px;z-index:20;overflow:visible` }, parent);
  s("circle", { cx: r, cy: r, r, fill, stroke: "#fff", "stroke-width": 10 }, svg);
  let mark;
  if (kind === "ok") mark = s("path", { d: `M${r * 0.52} ${r * 1.02} L${r * 0.86} ${r * 1.34} L${r * 1.5} ${r * 0.7}`,
    fill: "none", stroke: "#fff", "stroke-width": r * 0.24, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
  else {
    mark = s("g", {}, svg);
    s("path", { d: `M${r} ${r * 0.5} L${r} ${r * 1.1}`, stroke: "#fff", "stroke-width": r * 0.24, "stroke-linecap": "round" }, mark);
    s("circle", { cx: r, cy: r * 1.46, r: r * 0.14, fill: "#fff" }, mark);
  }
  return { el: svg, mark };
}
export function scene2(stage) {
  const root = h("div", { class: "scene", style: { background: C.yellow } }, stage);
  const bg = svgLayer(root, 1260, 2736, 1);
  const dev = device(root, { src: SRC(2), x: 180, y: 900, w: 900, id: "d2" });
  const picks = [["dns", "ok", -36, -31], ["ptr", "ok", 36, -5], ["match", "warn", -36, 26]];
  const cards = picks.map(([key, kind, dx, dy], i) => {
    const c = lift(root, dev, { src: SRC(2), region: ROWS2[key], scale: 1.3, dx, dy, radius: 40, shadow: "warm", z: 10 + i });
    const b = badge(root, { x: c.left + c.w - 6, y: c.top + c.h / 2, r: 50, kind });
    return { c, b };
  });
  const hl = headline(root, { eyebrow: `<span class="dot" style="background:${C.ink}"></span>Mail diagnostics`, color: C.ink,
    lines: ["Fix mail before", "it bounces"], sub: "SMTP, PTR, TLS, open relay and blacklist checks in one pass." });
  const tl = gsap.timeline({ paused: true });
  tl.from(hl.eb, { y: 30, opacity: 0, duration: 0.4, ease: "power3.out" }, 0)
    .from(hl.lines, { yPercent: 110, duration: 0.7, stagger: 0.08, ease: "power4.out" }, 0.05)
    .from(hl.sub, { y: 30, opacity: 0, duration: 0.5, ease: "power3.out" }, 0.3)
    .from(dev.el, { y: 700, duration: 0.9, ease: "power4.out" }, 0.15);
  cards.forEach(({ c, b }, i) => {
    tl.from(c.el, { x: 0, scale: 1 / 1.3, opacity: 0, duration: 0.6, ease: "back.out(1.6)" }, 0.7 + i * 0.35)
      .from(b.el, { scale: 0, transformOrigin: "50% 50%", duration: 0.45, ease: "back.out(2.5)" }, 0.95 + i * 0.35);
  });
  return { root, tl, dev, cards };
}

// ---------- Scene 3: global propagation (green) ----------
export async function scene3(stage) {
  const data = await (await fetch(new URL("./mapdata.json", import.meta.url))).json();
  const root = h("div", { class: "scene", style: { background: C.green } }, stage);
  const map = svgLayer(root, 1260, 2736, 1);
  const K = 1260 / data.W, CY0 = 2330, TOP = 600;
  const P = (x, y) => [x * K, TOP + (y - CY0) * K];
  const cv = h("canvas", { width: 1260, height: 2736, style: "position:absolute;left:0;top:0;z-index:0" }, root);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff";
  for (const [x, y] of data.dots) {
    if (y < CY0 || y > 4300) continue;
    const [px, py] = P(x, y);
    ctx.globalAlpha = 0.42 * Math.min(1, (y - CY0) / 400, (4300 - y) / 350);
    ctx.beginPath(); ctx.arc(px, py, 4.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const dots = cv;
  const hub = [630, 1560];
  const nodes = data.checks.filter((c) => c.n > 100).map((c) => P(c.x, c.y));
  const arcG = s("g", {}, map), nodeG = s("g", {}, map);
  const arcs = nodes.map(([x, y]) => {
    const mx = (x + hub[0]) / 2, my = y - 140 - Math.abs(x - hub[0]) * 0.18;
    return s("path", { d: `M${hub[0]} ${hub[1]} Q${mx} ${my} ${x} ${y}`, fill: "none", stroke: "#fff", "stroke-width": 5, "stroke-opacity": 0.9, "stroke-linecap": "round" }, arcG);
  });
  const nodeEls = nodes.map(([x, y]) => {
    const g = s("g", { transform: `translate(${x} ${y})` }, nodeG);
    s("circle", { r: 26, fill: "#fff", "fill-opacity": 0.22 }, g);
    s("circle", { r: 13, fill: "#fff" }, g);
    s("circle", { r: 6, fill: C.ink }, g);
    return g;
  });
  const dev = device(root, { src: SRC(3), x: 180, y: 1500, w: 900, id: "d3" });
  const bar = lift(root, dev, { src: SRC(3), region: [30, 1440, 2398, 1905], scale: 1.3, radius: 30, shadow: "deep", z: 12 });
  const hl = headline(root, { eyebrow: `<span class="dot" style="background:#fff"></span>DNS propagation`,
    lines: ["Watch DNS", "go global"], sub: "Results from resolvers worldwide." });
  const tl = gsap.timeline({ paused: true });
  tl.from(hl.eb, { y: 30, opacity: 0, duration: 0.4 }, 0)
    .from(hl.lines, { yPercent: 110, duration: 0.7, stagger: 0.08, ease: "power4.out" }, 0.05)
    .from(hl.sub, { y: 30, opacity: 0, duration: 0.5 }, 0.3)
    .from(dots, { opacity: 0, clipPath: "inset(0 50% 0 50%)", duration: 1.0, ease: "power2.out" }, 0.2)
    .from(dev.el, { y: 700, duration: 0.9, ease: "power4.out" }, 0.4);
  arcs.forEach((a, i) => {
    const len = a.getTotalLength();
    gsap.set(a, { strokeDasharray: len, strokeDashoffset: len });
    const head = s("circle", { r: 9, fill: "#fff", opacity: 0 }, arcG);
    const pr = { p: 0 };
    tl.to(a, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, 1.0 + i * 0.07);
    tl.to(pr, { p: 1, duration: 0.6, ease: "power2.out", onUpdate: () => {
      const pt = a.getPointAtLength(pr.p * len);
      head.setAttribute("cx", pt.x); head.setAttribute("cy", pt.y);
      head.setAttribute("opacity", pr.p > 0 && pr.p < 0.98 ? 1 : 0);
    } }, 1.0 + i * 0.07);
    tl.from(nodeEls[i], { scale: 0, transformOrigin: "50% 50%", duration: 0.35, ease: "back.out(3)" }, 1.45 + i * 0.07);
  });
  tl.from(bar.el, { y: 120, opacity: 0, duration: 0.7, ease: "power4.out" }, 1.2);
  return { root, tl, dev, bar, hub };
}
