// Food illustration kit (SVG) in the app's flat style, with soft warm shadows: tomatoes, basil, lemon, the pepper bowl
// and the opener's pasta plate. Shapes only, no text.
import { s, rng } from "./system.js";

export function kit(svg, seed = 7) {
  const defs = s("defs", {}, svg);
  const rnd = rng(seed);
  const blur = (id, sd) => { const f = s("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs); s("feGaussianBlur", { stdDeviation: sd }, f); };
  blur("k46", 46); blur("k40", 40); blur("k14", 14); blur("k6", 6); blur("k3", 3); blur("k2", 1.6);
  const rg = (id, stops, attrs = {}) => { const g = s("radialGradient", { id, ...attrs }, defs); stops.forEach(([o, c, a = 1]) => s("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g)); };
  const lg = (id, stops, attrs = {}) => { const g = s("linearGradient", { id, ...attrs }, defs); stops.forEach(([o, c, a = 1]) => s("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g)); };
  rg("kFlesh", [[0, "#F7A386"], [.5, "#EF7A5A"], [1, "#E0513A"]], { cx: .45, cy: .42, r: .62 });
  rg("kSkin", [[0, "#E2483A"], [.7, "#C83527"], [1, "#9E2418"]], { cx: .38, cy: .34, r: .75 });
  lg("kLeaf", [[0, "#6DB27A"], [.55, "#4E955E"], [1, "#3A7A48"]], { x1: 0, y1: 0, x2: 1, y2: 1 });
  rg("kLemon", [[0, "#FFF6C8"], [.6, "#FBE58A"], [1, "#F2CF4E"]], { cx: .45, cy: .42, r: .6 });
  rg("kBowl", [[0, "#FFFDF9"], [.75, "#FBF4EA"], [1, "#EEE1CF"]], { cx: .42, cy: .38, r: .7 });
  let leafN = 0;

  function shadow(g, d, dx = 7, dy = 11, a = .32, f = "k6") { return s("path", { d, fill: "#5a2a14", "fill-opacity": a, transform: `translate(${dx} ${dy})`, filter: `url(#${f})` }, g); }

  function tomatoWhole(parent, x, y, r, rot = 0) {
    const g = s("g", { transform: `translate(${x} ${y}) rotate(${rot})` }, parent);
    s("circle", { cx: 9, cy: 13, r, fill: "#5a2210", "fill-opacity": .34, filter: "url(#k6)" }, g);
    s("circle", { cx: 0, cy: 0, r, fill: "url(#kSkin)" }, g);
    s("ellipse", { cx: -r * .36, cy: -r * .38, rx: r * .26, ry: r * .15, transform: `rotate(-38 ${-r * .36} ${-r * .38})`, fill: "#fff", "fill-opacity": .75, filter: "url(#k2)" }, g);
    for (let k = 0; k < 5; k++) s("path", { d: `M0 0 Q ${r * .12} ${-r * .22} 0 ${-r * .46} Q ${-r * .12} ${-r * .22} 0 0 Z`, fill: "#4E955E", transform: `translate(${r * .08} ${r * .02}) rotate(${k * 72 + 10})` }, g);
    s("circle", { cx: r * .08, cy: r * .02, r: r * .09, fill: "#3A7A48" }, g);
    return g;
  }
  function tomatoHalf(parent, x, y, r, rot = 0) {
    const g = s("g", { transform: `translate(${x} ${y}) rotate(${rot})` }, parent);
    s("ellipse", { cx: 7, cy: 11, rx: r, ry: r * .93, fill: "#5a2210", "fill-opacity": .32, filter: "url(#k6)" }, g);
    s("ellipse", { cx: 0, cy: 0, rx: r, ry: r * .93, fill: "#C23526" }, g);
    s("ellipse", { cx: 0, cy: 0, rx: r * .88, ry: r * .81, fill: "url(#kFlesh)" }, g);
    for (const sd of [-1, 1]) {
      const lx = sd * r * .36, ly = sd * r * .06;
      s("ellipse", { cx: lx, cy: ly, rx: r * .30, ry: r * .40, transform: `rotate(${sd * 12} ${lx} ${ly})`, fill: "#FBBE9E", "fill-opacity": .75, filter: "url(#k2)" }, g);
      for (let j = 0; j < 3; j++) {
        const sy = ly + (j - 1) * r * .2, sx = lx + sd * (j === 1 ? r * .06 : -r * .02);
        s("ellipse", { cx: sx, cy: sy, rx: r * .06, ry: r * .085, transform: `rotate(${sd * 20} ${sx} ${sy})`, fill: "#F5D596" }, g);
      }
    }
    s("ellipse", { cx: 0, cy: 0, rx: r * .12, ry: r * .6, fill: "#FAC7AE", "fill-opacity": .6, filter: "url(#k2)" }, g);
    s("ellipse", { cx: -r * .4, cy: -r * .5, rx: r * .2, ry: r * .07, transform: `rotate(-35 ${-r * .4} ${-r * .5})`, fill: "#fff", "fill-opacity": .6, filter: "url(#k2)" }, g);
    return g;
  }
  function basil(parent, x, y, L, rot = 0) {
    const g = s("g", { transform: `translate(${x} ${y}) rotate(${rot})` }, parent);
    const Wd = L * .34;
    const d = `M0 0 C ${Wd} ${-L * .08} ${Wd * 1.1} ${-L * .62} 0 ${-L} C ${-Wd * 1.1} ${-L * .62} ${-Wd} ${-L * .08} 0 0 Z`;
    s("path", { d, fill: "#2c3a18", "fill-opacity": .32, transform: "translate(6 10)", filter: "url(#k6)" }, g);
    s("path", { d, fill: "url(#kLeaf)" }, g);
    const cid = "kl" + seed + "_" + (leafN++); const cp = s("clipPath", { id: cid }, defs); s("path", { d }, cp);
    const gv = s("g", { "clip-path": `url(#${cid})` }, g);
    s("path", { d: `M0 0 C ${-Wd} ${-L * .08} ${-Wd * 1.1} ${-L * .62} 0 ${-L} Z`, fill: "#fff", "fill-opacity": .10 }, gv);
    s("path", { d: `M0 ${-L * .02} Q ${L * .02} ${-L * .5} 0 ${-L * .95}`, stroke: "#9ED3A6", "stroke-opacity": .8, "stroke-width": L * .018, fill: "none", "stroke-linecap": "round" }, gv);
    for (let k = 1; k <= 4; k++) {
      const yy = -L * k / 5.2;
      for (const sd of [-1, 1]) s("path", { d: `M0 ${yy} Q ${sd * Wd * .45} ${yy - L * .05} ${sd * Wd * .72} ${yy - L * .14}`, stroke: "#9ED3A6", "stroke-opacity": .45, "stroke-width": L * .012, fill: "none", "stroke-linecap": "round" }, gv);
    }
    return g;
  }
  function sprig(parent, x0, y0, x1, y1, L = 160) {
    const cx = (x0 + x1) / 2 + (y1 - y0) * .12, cy = (y0 + y1) / 2;
    s("path", { d: `M${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`, stroke: "#3f7d4b", "stroke-width": 7, fill: "none", "stroke-linecap": "round" }, parent);
    const mx = .25 * x0 + .5 * cx + .25 * x1, my = .25 * y0 + .5 * cy + .25 * y1;
    const ang = Math.atan2(y1 - y0, x1 - x0) * 57.3 + 90;
    basil(parent, mx, my, L * .82, ang - 55);
    basil(parent, mx, my, L * .7, ang + 50);
    basil(parent, x1, y1, L, ang);
  }
  function lemonHalf(parent, x, y, r, rot = 0) {
    const g = s("g", { transform: `translate(${x} ${y}) rotate(${rot})` }, parent);
    s("circle", { cx: 9, cy: 13, r, fill: "#6a4a10", "fill-opacity": .30, filter: "url(#k6)" }, g);
    s("circle", { cx: 0, cy: 0, r, fill: "#F1C232" }, g);
    s("circle", { cx: 0, cy: 0, r: r * .9, fill: "#FFF4D0" }, g);
    s("circle", { cx: 0, cy: 0, r: r * .82, fill: "url(#kLemon)" }, g);
    for (let k = 0; k < 9; k++) {
      const a = k * 40 * Math.PI / 180;
      s("path", { d: `M0 0 L ${Math.cos(a) * r * .8} ${Math.sin(a) * r * .8}`, stroke: "#FFF8DC", "stroke-width": r * .05, "stroke-linecap": "round" }, g);
    }
    s("circle", { cx: 0, cy: 0, r: r * .1, fill: "#FFF8DC" }, g);
    s("ellipse", { cx: -r * .4, cy: -r * .42, rx: r * .22, ry: r * .08, transform: `rotate(-40 ${-r * .4} ${-r * .42})`, fill: "#fff", "fill-opacity": .6, filter: "url(#k2)" }, g);
    return g;
  }
  // Roasted pepper bowl, seen from above: ceramic bowl, grain base, charred pepper strips, herbs.
  function pepperBowl(parent, x, y, R) {
    const g = s("g", {}, parent);
    s("circle", { cx: x + 40, cy: y + 60, r: R * .98, fill: "#6b3a1f", "fill-opacity": .22, filter: "url(#k40)" }, g);
    s("circle", { cx: x + 8, cy: y + 14, r: R, fill: "#5a3020", "fill-opacity": .2, filter: "url(#k14)" }, g);
    s("circle", { cx: x, cy: y, r: R, fill: "url(#kBowl)" }, g);
    s("circle", { cx: x, cy: y, r: R - 6, fill: "none", stroke: "#4E955E", "stroke-width": 10 }, g);
    const RI = R * .8;
    rg("kGrain", [[0, "#F3E3BE"], [1, "#E4CC98"]]);
    s("circle", { cx: x, cy: y, r: RI, fill: "url(#kGrain)" }, g);
    for (let i = 0; i < 260; i++) {
      const a = rnd() * 6.28, r = RI * Math.sqrt(rnd()) * .96;
      s("ellipse", { cx: x + Math.cos(a) * r, cy: y + Math.sin(a) * r, rx: 5, ry: 3, transform: `rotate(${rnd() * 180} ${x + Math.cos(a) * r} ${y + Math.sin(a) * r})`, fill: rnd() < .5 ? "#FBF0D6" : "#DCC08A" }, g);
    }
    const cols = [["#D9442F", "#A92A1C"], ["#F2B233", "#C7861A"], ["#E86A2E", "#B4471A"]];
    for (let i = 0; i < 16; i++) {
      const a = rnd() * 6.28, r = RI * Math.sqrt(rnd()) * .7, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const L = RI * (.3 + rnd() * .22), w = RI * .09, rot = rnd() * 180, [c, dk] = cols[i % 3];
      const d = `M${-L / 2} 0 Q 0 ${-w * 1.6} ${L / 2} 0 Q 0 ${-w * .2} ${-L / 2} 0 Z`;
      const pg = s("g", { transform: `translate(${px} ${py}) rotate(${rot})` }, g);
      shadow(pg, d, 3, 6, .3, "k3");
      s("path", { d, fill: c, stroke: dk, "stroke-width": 2.5 }, pg);
      s("path", { d: `M${-L * .3} ${-w * .55} Q 0 ${-w * 1.0} ${L * .3} ${-w * .55}`, stroke: "#fff", "stroke-opacity": .45, "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, pg);
      if (rnd() < .5) s("ellipse", { cx: (rnd() - .5) * L * .5, cy: -w * .5, rx: w * .5, ry: w * .25, fill: "#3a1e12", "fill-opacity": .35, filter: "url(#k2)" }, pg);
    }
    for (let i = 0; i < 4; i++) basil(g, x + (rnd() - .5) * RI, y + (rnd() - .5) * RI, 80 + rnd() * 30, rnd() * 360);
    return g;
  }
  // The opener's hero: an enamel plate seen from above with a pasta nest, sauce, tomatoes and basil. f scales the
  // toppings with the plate (drawn for R = 560).
  function pastaPlate(parent, PXc, PYc, R, pseed = 11) {
    const f = R / 560, r = rng(pseed);
    s("circle", { cx: PXc + 46 * f, cy: PYc + 70 * f, r: R * 0.98, fill: "#6b3a1f", "fill-opacity": .22, filter: "url(#k46)" }, parent);
    s("circle", { cx: PXc + 8 * f, cy: PYc + 14 * f, r: R * 0.995, fill: "#5a3020", "fill-opacity": .22, filter: "url(#k14)" }, parent);
    rg("kPlate", [[0, "#FFFDF9"], [.7, "#FCF6EE"], [1, "#F1E6D8"]], { cx: .42, cy: .38, r: .7 });
    s("circle", { cx: PXc, cy: PYc, r: R, fill: "url(#kPlate)" }, parent);
    s("circle", { cx: PXc, cy: PYc, r: R - 7 * f, fill: "none", stroke: "#C73D2D", "stroke-width": 12 * f }, parent);
    s("circle", { cx: PXc, cy: PYc, r: R - 15 * f, fill: "none", stroke: "#fff", "stroke-opacity": .7, "stroke-width": 3 * f }, parent);
    // well: crescent shade where the rim shades it, edge line and highlight
    const RW = R * 0.74;
    const clipW = s("clipPath", { id: "kWell" }, defs); s("circle", { cx: PXc, cy: PYc, r: RW }, clipW);
    const gw = s("g", { "clip-path": "url(#kWell)" }, parent);
    rg("kWellShade", [[0, "#000", 0], [.82, "#000", 0], [1, "#8a5a36", .20]], { cx: .56, cy: .58, r: .62 });
    s("circle", { cx: PXc, cy: PYc, r: RW, fill: "url(#kWellShade)" }, gw);
    s("circle", { cx: PXc, cy: PYc, r: RW, fill: "none", stroke: "#E4D3BE", "stroke-width": 3 * f }, parent);
    s("circle", { cx: PXc, cy: PYc, r: RW + 4 * f, fill: "none", stroke: "#fff", "stroke-opacity": .8, "stroke-width": 2.5 * f }, parent);
    // pasta nest: arcs around a jittered swirl centre, radius biased outward so the edge is made of strands
    const NX = PXc - 8 * f, NY = PYc + 4 * f, RN = R * 0.58;
    const nest = s("g", {}, parent);
    s("circle", { cx: NX + 18 * f, cy: NY + 26 * f, r: RN * 0.96, fill: "#7a4a1a", "fill-opacity": .28, filter: "url(#k14)" }, nest);
    rg("kNestBase", [[0, "#E7A948"], [.8, "#E0A040"], [1, "#D08F33"]]);
    s("circle", { cx: NX, cy: NY, r: RN * 0.9, fill: "url(#kNestBase)", filter: "url(#k6)" }, nest);
    const gold = ["#F7D27E", "#F3C567", "#EEB853", "#F9DC95", "#F0BF5C"];
    const strand = () => {
      const rr = RN * (0.12 + 0.86 * Math.pow(r(), 0.7));
      const cx = NX + (r() - .5) * RN * .22, cy = NY + (r() - .5) * RN * .22;
      const a0 = r() * Math.PI * 2, sweep = (0.7 + r() * 1.9) * (rr < RN * .3 ? 1.6 : 1);
      const n = Math.max(8, Math.round(sweep * rr / (14 * f)));
      const wob = r() * 6.28, wa = (4 + r() * 8) * f, pts = [];
      for (let i = 0; i <= n; i++) {
        const tt = i / n, a = a0 + sweep * tt;
        const r2 = rr * (1 + 0.06 * Math.sin(tt * 6 + wob)) + wa * Math.sin(tt * 9 + wob);
        pts.push([cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.97]);
      }
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
      }
      return d;
    };
    const strands = (count) => {
      for (let i = 0; i < count; i++) {
        const d = strand(), w = (10 + r() * 3.5) * f, c = gold[Math.floor(r() * gold.length)];
        s("path", { d, fill: "none", stroke: "#B9782A", "stroke-opacity": .55, "stroke-width": w + 3 * f, "stroke-linecap": "round", transform: `translate(${2.5 * f} ${4 * f})` }, nest);
        s("path", { d, fill: "none", stroke: c, "stroke-width": w, "stroke-linecap": "round" }, nest);
        if (r() < .6) s("path", { d, fill: "none", stroke: "#FFF3D2", "stroke-opacity": .55, "stroke-width": w * .28, "stroke-linecap": "round", transform: `translate(${-1.6 * f} ${-2.4 * f})` }, nest);
      }
    };
    strands(190);
    const sauce = s("g", { filter: "url(#k3)" }, nest);   // sauce tucked between the layers
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.28, rr = RN * (0.15 + r() * .6), x = NX + Math.cos(a) * rr, y = NY + Math.sin(a) * rr;
      s("ellipse", { cx: x, cy: y, rx: (26 + r() * 30) * f, ry: (14 + r() * 18) * f, transform: `rotate(${(a * 57.3 + 90).toFixed(0)} ${x} ${y})`, fill: i % 3 ? "#D9502F" : "#C73D2D", "fill-opacity": .85 }, sauce);
    }
    strands(130);
    tomatoHalf(parent, NX - RN * .36, NY - RN * .30, 66 * f, 20);
    tomatoWhole(parent, NX + RN * .42, NY + RN * .10, 56 * f, 0);
    tomatoHalf(parent, NX - RN * .06, NY + RN * .50, 58 * f, 70);
    tomatoWhole(parent, NX + RN * .26, NY - RN * .52, 48 * f, 40);
    basil(parent, NX + RN * .10, NY - RN * .05, 200 * f, 28);
    basil(parent, NX + RN * .08, NY - RN * .02, 160 * f, -38);
    basil(parent, NX - RN * .54, NY + RN * .22, 130 * f, -120);
    for (let i = 0; i < 38; i++) {   // cracked pepper: fine and sparse
      const a = r() * 6.28, rr = RN * Math.sqrt(r()) * .92;
      s("circle", { cx: NX + Math.cos(a) * rr, cy: NY + Math.sin(a) * rr, r: (1.2 + r() * 1.6) * f, fill: "#3a2a22", "fill-opacity": .6 }, parent);
    }
  }
  return { defs, tomatoWhole, tomatoHalf, basil, sprig, lemonHalf, pepperBowl, pastaPlate, rnd };
}
