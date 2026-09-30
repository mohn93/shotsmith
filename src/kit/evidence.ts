import type { SidecarClaimShown, SidecarGenerated, SidecarText } from "../shared/sidecar.js";

// What ready() reads from the page: every visible text node (the document and open shadow roots), text shown some
// other way (generated), and what each claim element visibly shows.

type Box = [number, number, number, number];
// A clip region: its bounding rectangle, and for circle() and ellipse() the ellipse itself.
interface Rect { l: number; t: number; r: number; b: number; ellipse?: { cx: number; cy: number; rx: number; ry: number } }

const EMPTY: Box = [0, 0, 0, 0];
const boxOf = (r: DOMRect): Box => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const fontSize = (el: Element) => parseFloat(getComputedStyle(el).fontSize) || 0;

// The parent in the flat tree: a slotted node's slot, a shadow root's host.
function parentOf(n: Node): Element | null {
  const slot = (n as Element | Text).assignedSlot;
  if (slot) return slot;
  const p = n.parentNode;
  if (p instanceof ShadowRoot) return p.host;
  return p instanceof Element ? p : null;
}

function composedClosest(el: Element | null, selector: string): Element | null {
  for (let n = el; n; n = parentOf(n)) if (n.matches(selector)) return n;
  return null;
}

// The document and every open shadow root, outermost first.
function roots(): (Document | ShadowRoot)[] {
  const out: (Document | ShadowRoot)[] = [document];
  for (let i = 0; i < out.length; i++) for (const el of Array.from(out[i].querySelectorAll("*"))) if (el.shadowRoot) out.push(el.shadowRoot);
  return out;
}

// --- Visibility ---------------------------------------------------------------------------------------------------

function alpha(c: string): number {
  if (!c || c === "transparent") return 0;
  const slash = /\/\s*(-?[\d.]+)(%?)\s*\)$/.exec(c);
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
  const rgba = /^rgba\(([^)]*)\)$/.exec(c);
  if (rgba) { const parts = rgba[1].split(","); if (parts.length === 4) return Number(parts[3]); }
  return 1;
}

const clipsBackgroundToText = (s: CSSStyleDeclaration) =>
  (s.getPropertyValue("background-clip") === "text" || s.getPropertyValue("-webkit-background-clip") === "text") &&
  (s.backgroundImage !== "none" || alpha(s.backgroundColor) > 0);

// SVG text is painted with fill and stroke; color only matters through currentColor, which the computed values resolve.
function svgInks(cs: CSSStyleDeclaration): boolean {
  const paints = (paint: string, opacity: string) => paint !== "none" && Number(opacity) > 0 && (paint.startsWith("url(") || alpha(paint) > 0);
  return paints(cs.fill, cs.fillOpacity) || (paints(cs.stroke, cs.strokeOpacity) && parseFloat(cs.strokeWidth) > 0);
}

// Whether text with style cs puts ink on the page: a visible fill, a stroke, a shadow, or a background clipped to the
// text by it or an ancestor (gradient text sets color: transparent).
function inks(cs: CSSStyleDeclaration, from: Element | null): boolean {
  if (alpha(cs.getPropertyValue("-webkit-text-fill-color") || cs.color) > 0) return true;
  if (parseFloat(cs.getPropertyValue("-webkit-text-stroke-width")) > 0 && alpha(cs.getPropertyValue("-webkit-text-stroke-color")) > 0) return true;
  if (cs.textShadow && cs.textShadow !== "none") return true;
  if (clipsBackgroundToText(cs)) return true;
  for (let n = from; n; n = parentOf(n)) if (clipsBackgroundToText(getComputedStyle(n))) return true;
  return false;
}

// display, content-visibility, visibility (so a visibility: visible child of a hidden parent counts) and opacity.
const visibleEl = (el: Element) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true });

// The element whose style a text node takes: its parent, or the host for text directly in a shadow root.
const styleOwner = (t: Text): Element | null =>
  t.parentElement ?? (t.parentNode instanceof ShadowRoot ? t.parentNode.host : null);

// A display: contents element has no box, so checkVisibility is false for it: judge its text by the nearest ancestor
// that has a box, and by its own visibility (inherited by the text; opacity does not apply without a box).
function textOwnerVisible(el: Element): boolean {
  if (getComputedStyle(el).display !== "contents") return visibleEl(el);
  let a = parentOf(el);
  while (a && getComputedStyle(a).display === "contents") a = parentOf(a);
  return !!a && a.checkVisibility({ opacityProperty: true }) && getComputedStyle(el).visibility === "visible";
}

interface TextInfo { rect: DOMRect; visible: boolean }
const textInfos = new Map<Text, TextInfo>();
function textInfo(t: Text): TextInfo {
  const known = textInfos.get(t);
  if (known) return known;
  const el = styleOwner(t);
  const range = document.createRange();
  range.selectNodeContents(t);
  const rect = range.getBoundingClientRect();
  const visible = !!el && !!collapse(t.nodeValue ?? "") && !el.closest("script,style,template,noscript") &&
    rect.width > 0 && rect.height > 0 && textOwnerVisible(el) &&
    (el instanceof SVGElement ? svgInks(getComputedStyle(el)) : inks(getComputedStyle(el), parentOf(el)));
  const info = { rect, visible };
  textInfos.set(t, info);
  return info;
}

// --- Clipping -----------------------------------------------------------------------------------------------------

// Whether an element is the containing block of positioned descendants of every kind (fixed included).
const holdsFixed = (s: CSSStyleDeclaration) =>
  s.transform !== "none" || s.perspective !== "none" || s.filter !== "none" || s.translate !== "none" || s.rotate !== "none" || s.scale !== "none" ||
  (s.getPropertyValue("backdrop-filter") || "none") !== "none" || /paint|layout|strict|content/.test(s.contain) ||
  /transform|perspective|filter/.test(s.willChange) || (s.containerType || "normal") !== "normal";

// Local CSS px to viewport px for an element's own box (transforms included).
function scaleOf(a: Element, r: DOMRect): [number, number] {
  const h = a as HTMLElement;
  return [h.offsetWidth ? r.width / h.offsetWidth : 1, h.offsetHeight ? r.height / h.offsetHeight : 1];
}

function paddingBox(a: Element, r: DOMRect, x: boolean, y: boolean): Rect {
  let l = r.left, t = r.top, rr = r.right, b = r.bottom;
  if (a instanceof HTMLElement && a.offsetWidth && a.offsetHeight) {
    const [sx, sy] = scaleOf(a, r);
    l = r.left + a.clientLeft * sx; t = r.top + a.clientTop * sy; rr = l + a.clientWidth * sx; b = t + a.clientHeight * sy;
  }
  return { l: x ? l : -Infinity, t: y ? t : -Infinity, r: x ? rr : Infinity, b: y ? b : Infinity };
}

// A length in px or % of ref, scaled to viewport px; null for anything else (calc(), keywords).
function length(s: string | undefined, ref: number, k: number): number | null {
  const m = /^(-?[\d.]+)(px|%)?$/.exec(s ?? "");
  if (!m) return null;
  return m[2] === "%" ? (Number(m[1]) / 100) * ref : Number(m[1]) * k;
}

// Nothing fits inside it: text under a clip the kit cannot evaluate counts as clipped.
const UNKNOWN_CLIP: Rect = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };

// The bounding rectangle of a clip-path shape (border-box reference); UNKNOWN_CLIP when the shape cannot be read
// (path(), url(), calc(), keyword radii, another reference box).
function clipPathRect(value: string, a: Element, r: DOMRect): Rect {
  const border = { l: r.left, t: r.top, r: r.right, b: r.bottom };
  const [sx, sy] = scaleOf(a, r);
  const v = value.replace(/\s+border-box$/, "");
  if (v === "border-box" || v === "margin-box") return border; // margin-box is larger; the border box is the stricter test
  if (!/^(inset|polygon|circle|ellipse)\([^()]*\)$/.test(v)) return UNKNOWN_CLIP;
  let m = /^inset\(([^)]*)\)/.exec(v);
  if (m) {
    const [t0, r0 = t0, b0 = t0, l0 = r0] = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
    const t = length(t0, r.height, sy), rt = length(r0, r.width, sx), b = length(b0, r.height, sy), l = length(l0, r.width, sx);
    return t === null || rt === null || b === null || l === null ? UNKNOWN_CLIP : { l: r.left + l, t: r.top + t, r: r.right - rt, b: r.bottom - b };
  }
  m = /^polygon\((.*)\)/.exec(v);
  if (m) {
    const pts = m[1].replace(/^\s*(nonzero|evenodd)\s*,/, "").split(",").map((p) => p.trim().split(/\s+/));
    const xs = pts.map((p) => length(p[0], r.width, sx)), ys = pts.map((p) => length(p[1], r.height, sy));
    if (xs.some((x) => x === null) || ys.some((y) => y === null)) return UNKNOWN_CLIP;
    return { l: r.left + Math.min(...(xs as number[])), t: r.top + Math.min(...(ys as number[])), r: r.left + Math.max(...(xs as number[])), b: r.top + Math.max(...(ys as number[])) };
  }
  m = /^(circle|ellipse)\(([^)]*?)(?:\s*at ([^)]*))?\)/.exec(v);
  if (m) {
    // Local reference box size; the scale maps local px to viewport px.
    const w = r.width / sx, h = r.height / sy;
    const [px = "50%", py = "50%"] = (m[3] ?? "").trim().split(/\s+/).filter(Boolean);
    const cx = length(px, w, 1), cy = length(py, h, 1);
    if (cx === null || cy === null) return UNKNOWN_CLIP;
    const side = (s: string | undefined, axis: "x" | "y" | "r"): number | null => {
      const token = s ?? "closest-side";
      const dx = [cx, w - cx], dy = [cy, h - cy];
      const pick = token === "closest-side" ? Math.min : token === "farthest-side" ? Math.max : null;
      if (pick) return axis === "x" ? pick(...dx) : axis === "y" ? pick(...dy) : pick(...dx, ...dy);
      return length(token, axis === "x" ? w : axis === "y" ? h : Math.hypot(w, h) / Math.SQRT2, 1);
    };
    const radii = m[2].trim().split(/\s+/).filter(Boolean);
    const rx = m[1] === "circle" ? side(radii[0], "r") : side(radii[0], "x");
    const ry = m[1] === "circle" ? rx : side(radii[1], "y");
    if (rx === null || ry === null) return UNKNOWN_CLIP;
    const e = { cx: r.left + cx * sx, cy: r.top + cy * sy, rx: rx * sx, ry: ry * sy };
    return { l: e.cx - e.rx, t: e.cy - e.ry, r: e.cx + e.rx, b: e.cy + e.ry, ellipse: e };
  }
  return UNKNOWN_CLIP;
}

// The legacy clip: rect(top, right, bottom, left) on an absolutely positioned element; auto keeps that edge.
function legacyClip(v: string, a: Element, r: DOMRect): Rect {
  const m = /^rect\(([^()]*)\)$/.exec(v);
  if (!m) return UNKNOWN_CLIP;
  const [sx, sy] = scaleOf(a, r);
  const parts = m[1].split(/[\s,]+/);
  if (parts.length !== 4 || parts.some((x) => x !== "auto" && length(x, 0, 1) === null)) return UNKNOWN_CLIP;
  const [t, rt, b, l] = parts.map((x, i) => (x === "auto" ? null : length(x, 0, i % 2 ? sx : sy)));
  return { l: l === null ? r.left : r.left + l, t: t === null ? r.top : r.top + t, r: rt === null ? r.right : r.left + rt, b: b === null ? r.bottom : r.top + b };
}

// The clip rectangles of every ancestor that clips `el`'s content (own: el's own clipping applies, as for its text).
// overflow clips only descendants whose containing-block chain passes through it; clip-path, clip and paint
// containment clip every descendant.
const clipCache = { own: new Map<Element, Rect[]>(), outer: new Map<Element, Rect[]>() };
function clipsAround(el: Element, own: boolean): Rect[] {
  const cache = own ? clipCache.own : clipCache.outer;
  const known = cache.get(el);
  if (known) return known;
  const out: Rect[] = [];
  let pos = own ? "static" : getComputedStyle(el).position;
  for (let a = own ? el : parentOf(el); a; a = parentOf(a)) {
    const s = getComputedStyle(a);
    if (s.display === "contents") continue;
    const block = pos === "fixed" ? holdsFixed(s) : pos === "absolute" ? s.position !== "static" || holdsFixed(s) : true;
    const r = a.getBoundingClientRect();
    if (s.clipPath && s.clipPath !== "none") out.push(clipPathRect(s.clipPath, a, r));
    if ((s.position === "absolute" || s.position === "fixed") && s.clip && s.clip !== "auto") out.push(legacyClip(s.clip, a, r));
    if (/paint|strict|content/.test(s.contain) || s.contentVisibility === "auto") out.push(paddingBox(a, r, true, true));
    else if (block && (s.display !== "inline" || a instanceof SVGSVGElement)) {
      const x = s.overflowX !== "visible", y = s.overflowY !== "visible";
      if (x || y) out.push(paddingBox(a, r, x, y));
    }
    if (block) pos = s.position;
  }
  cache.set(el, out);
  return out;
}

// Inside the clip's rectangle, and for an ellipse all four corners inside it (an ellipse is convex), with slack.
function inside(r: DOMRect, c: Rect, sx: number, sy: number): boolean {
  if (!(r.left >= c.l - sx && r.right <= c.r + sx && r.top >= c.t - sy && r.bottom <= c.b + sy)) return false;
  const e = c.ellipse;
  if (!e) return true;
  const rx = e.rx + sx, ry = e.ry + sy;
  return [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]]
    .every(([x, y]) => ((x - e.cx) / rx) ** 2 + ((y - e.cy) / ry) ** 2 <= 1);
}

// A line-height below the font's content area (headlines use ~1.08) makes a line's box spill a few px past its
// element. That is neither overflow nor clipping, so the vertical direction gets a quarter-em of slack.
const slackY = (el: Element) => 1 + 0.25 * fontSize(el);

function union(rects: DOMRect[]): DOMRect {
  const l = Math.min(...rects.map((x) => x.left)), t = Math.min(...rects.map((x) => x.top));
  return new DOMRect(l, t, Math.max(...rects.map((x) => x.right)) - l, Math.max(...rects.map((x) => x.bottom)) - t);
}

const claimOverflows = new Map<Element, boolean>();
function claimOverflow(claimEl: HTMLElement): boolean {
  const known = claimOverflows.get(claimEl);
  if (known !== undefined) return known;
  let over = claimEl.dataset.overflow === "1";
  const sy = slackY(claimEl);
  if (!over && claimEl.clientWidth > 0) over = claimEl.scrollWidth > claimEl.clientWidth + 1 || claimEl.scrollHeight > claimEl.clientHeight + sy;
  else if (!over) {
    // An inline element has no client box: its line boxes must fit inside every clipping ancestor.
    const rects = Array.from(claimEl.getClientRects()).filter((x) => x.width > 0 || x.height > 0);
    if (rects.length) { const u = union(rects); over = clipsAround(claimEl, false).some((c) => !inside(u, c, 1, sy)); }
  }
  claimOverflows.set(claimEl, over);
  return over;
}

// text-overflow applies to the inline content of a block container: check the text's inline ancestors and that container.
function ellipsisOverflow(el: Element): boolean {
  for (let a: Element | null = el; a; a = parentOf(a)) {
    const s = getComputedStyle(a);
    if (s.textOverflow && s.textOverflow !== "clip" && a.scrollWidth > a.clientWidth + 1) return true;
    if (!s.display.startsWith("inline") && s.display !== "contents") return false;
  }
  return false;
}

// --- Texts ----------------------------------------------------------------------------------------------------------

function collectTexts(): SidecarText[] {
  const out: SidecarText[] = [];
  const W = innerWidth, H = innerHeight;
  const ids = new Map<Element, number>();
  for (const root of roots()) {
    const start = root instanceof Document ? root.body : root;
    if (!start) continue;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const { rect: r, visible } = textInfo(n);
      const el = styleOwner(n);
      if (!visible || !el) continue;
      if (!ids.has(el)) { ids.set(el, ids.size); el.setAttribute("data-sx", String(ids.get(el))); }
      const claimEl = composedClosest(el, "[data-claim]") as HTMLElement | null;
      const sy = slackY(el);
      out.push({
        el: ids.get(el)!,
        claim: claimEl?.dataset.claim ?? null,
        chrome: !!composedClosest(el, "[data-chrome]"),
        text: collapse(n.nodeValue ?? ""),
        box: boxOf(r),
        font: getComputedStyle(el).fontFamily,
        overflow: (!!claimEl && claimOverflow(claimEl)) || ellipsisOverflow(el),
        clipped: r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5 || clipsAround(el, true).some((c) => !inside(r, c, 1, sy)),
        safeArea: r.top < H * 0.04 || r.bottom > H * 0.96,
        shrink: claimEl?.dataset.shrink ? Number(claimEl.dataset.shrink) : null,
        covered: true,
        fallbackFonts: [],
      });
    }
  }
  return out;
}

// --- Claim evidence -------------------------------------------------------------------------------------------------

const flatChildren = (n: Element): Node[] => {
  if (n.shadowRoot) return Array.from(n.shadowRoot.childNodes);
  if (n instanceof HTMLSlotElement) { const a = n.assignedNodes(); return a.length ? a : Array.from(n.childNodes); }
  return Array.from(n.childNodes);
};

// The claim element's visible text nodes in rendering order. Line breaks and block edges become spaces; a nested claim
// element reports its own text.
function shownText(claimEl: Element): { text: string; rects: DOMRect[] } {
  const parts: string[] = [], rects: DOMRect[] = [];
  const walk = (n: Node, top: boolean): void => {
    if (n.nodeType === Node.TEXT_NODE) {
      const info = textInfo(n as Text);
      if (info.visible) { parts.push(n.nodeValue ?? ""); rects.push(info.rect); }
      return;
    }
    if (!(n instanceof Element) || (!top && n.hasAttribute("data-claim")) || n.matches("script,style,template,noscript")) return;
    if (n.localName === "br") { parts.push(" "); return; }
    const d = getComputedStyle(n).display, edge = !d.startsWith("inline") && d !== "contents";
    if (edge) parts.push(" ");
    for (const c of flatChildren(n)) walk(c, false);
    if (edge) parts.push(" ");
  };
  walk(claimEl, true);
  return { text: collapse(parts.join("")), rects };
}

// Claim elements that show some text. A hidden claim element can still show a visible child; one that shows nothing is
// not evidence of anything. A boxless (display: contents) element's box is the union of its shown text.
function collectClaimsShown(): SidecarClaimShown[] {
  const out: SidecarClaimShown[] = [];
  for (const el of roots().flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>("[data-claim]")))) {
    const { text, rects } = shownText(el);
    if (!text) continue;
    const r = el.getBoundingClientRect();
    out.push({ claim: el.dataset.claim ?? "", text, box: boxOf(r.width > 0 && r.height > 0 ? r : union(rects)) });
  }
  return out;
}

// --- Generated text -------------------------------------------------------------------------------------------------

// The text a CSS content value shows: strings, attr() and quotes. A counter() cannot be read from the page, so the raw
// value stands in for it. null when the value shows no text (none, normal, images only).
function contentText(v: string, el: Element): string | null {
  if (!v || v === "none" || v === "normal") return null;
  let out = "", textual = false, unresolved = false, i = 0, end = v.length;
  while (i < v.length) {
    const ch = v[i];
    if (/[\s,]/.test(ch)) { i++; continue; }
    if (ch === "/") { end = i; break; } // alternative text for speech follows; it is not drawn
    if (ch === '"' || ch === "'") {
      i++;
      while (i < v.length && v[i] !== ch) {
        if (v[i] !== "\\") { out += v[i++]; continue; }
        const hex = /^[0-9a-fA-F]{1,6}\s?/.exec(v.slice(i + 1));
        if (hex) { out += String.fromCodePoint(parseInt(hex[0], 16)); i += 1 + hex[0].length; } else { out += v[i + 1] ?? ""; i += 2; }
      }
      i++; textual = true; continue;
    }
    const m = /^[-\w]+/.exec(v.slice(i));
    if (!m) { i++; continue; }
    const name = m[0].toLowerCase();
    i += m[0].length;
    if (v[i] === "(") {
      let depth = 0, j = i;
      for (; j < v.length; j++) {
        const c = v[j];
        if (c === '"' || c === "'") { for (j++; j < v.length && v[j] !== c; j++) if (v[j] === "\\") j++; }
        else if (c === "(") depth++;
        else if (c === ")" && --depth === 0) break;
      }
      const args = v.slice(i + 1, j);
      i = j + 1;
      if (name === "attr") { out += el.getAttribute(args.trim().split(/[\s,]+/)[0]) ?? ""; textual = true; }
      else if (name === "counter" || name === "counters") { unresolved = true; textual = true; }
      continue; // url(), image-set(), gradients: images, not text
    }
    if (name === "open-quote" || name === "close-quote") { out += '"'; textual = true; }
  }
  if (!textual) return null;
  return collapse(unresolved ? v.slice(0, end) : out) || null;
}

// A pseudo-element renders when its element has a box (or is display: contents inside one) and it is not hidden itself.
function pseudoShows(el: Element, cs: CSSStyleDeclaration): boolean {
  if (cs.display === "none" || cs.visibility !== "visible" || cs.opacity === "0") return false;
  if (el.checkVisibility({ opacityProperty: true })) return true;
  const p = parentOf(el);
  return getComputedStyle(el).display === "contents" && !!p && p.checkVisibility({ opacityProperty: true });
}

// Bullet shapes, not words.
const QUIET_MARKERS = new Set(["none", "disc", "circle", "square", "disclosure-open", "disclosure-closed"]);
function markerText(el: Element, cs: CSSStyleDeclaration, ms: CSSStyleDeclaration): string | null {
  if (ms.content && ms.content !== "normal") return contentText(ms.content, el);
  const type = cs.listStyleType;
  if (/^["']/.test(type)) return contentText(type, el);
  return QUIET_MARKERS.has(type) ? null : type;
}

const NO_TEXT_INPUTS = new Set(["hidden", "checkbox", "radio", "range", "color", "image"]);
const DESCRIBED_INPUTS = new Set(["file", "date", "time", "datetime-local", "month", "week"]);
function formText(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (el instanceof HTMLSelectElement) return Array.from(el.multiple || el.size > 1 ? el.options : el.selectedOptions).map((o) => o.label || o.text).join(" ");
  if (el instanceof HTMLTextAreaElement) return el.value || el.placeholder;
  if (NO_TEXT_INPUTS.has(el.type)) return "";
  if (el.type === "password") return el.value ? "•".repeat(el.value.length) : el.placeholder;
  if (el.type === "submit" || el.type === "reset") return el.value || (el.type === "submit" ? "Submit" : "Reset");
  if (DESCRIBED_INPUTS.has(el.type)) return el.value || `input type=${el.type}`;
  return el.value || el.placeholder;
}

function frameText(el: Element): string {
  if (el.localName === "iframe") return el.hasAttribute("srcdoc") ? "iframe srcdoc" : `iframe src=${el.getAttribute("src") ?? ""}`;
  if (el.localName === "object") return `object data=${el.getAttribute("data") ?? ""}`;
  return `${el.localName} src=${el.getAttribute("src") ?? ""}`;
}


// url("...") values from a computed style; computed values always quote and escape the URL.
export function cssUrls(v: string | undefined): string[] {
  return Array.from((v ?? "").matchAll(/url\("((?:[^"\\]|\\.)*)"\)/g), (m) => m[1].replace(/\\(.)/g, "$1"));
}
const IMAGE_PROPS = ["background-image", "mask-image", "-webkit-mask-image", "list-style-image", "border-image-source"];

function isSvgUrl(u: string): boolean {
  if (/^data:image\/svg\+xml[;,]/i.test(u) || u.startsWith("blob:")) return true;
  try { return /\.svgz?$/i.test(new URL(u, location.href).pathname); } catch { return false; }
}

// The text of every <text> and <foreignObject> in an SVG image, and of SVG data URLs it embeds. null if unreadable.
async function svgTexts(url: string, depth = 0): Promise<string[] | null> {
  let src: string;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    if (url.startsWith("blob:") && !/svg/i.test(res.headers.get("content-type") ?? "")) return [];
    src = await res.text();
  } catch { return null; }
  const doc = new DOMParser().parseFromString(src, "image/svg+xml");
  if (doc.querySelector("parsererror")) return []; // an SVG that does not parse is not drawn
  const out = Array.from(doc.querySelectorAll("text, foreignObject"), (n) => collapse(n.textContent ?? "")).filter(Boolean);
  if (depth < 3) {
    for (const img of Array.from(doc.querySelectorAll("image, feImage"))) {
      const href = img.getAttribute("href") ?? img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (href && /^data:image\/svg\+xml[;,]/i.test(href)) out.push(...((await svgTexts(href, depth + 1)) ?? [`unreadable SVG image inside ${url.slice(0, 80)}`]));
    }
  }
  return out;
}

// An image that is not drawn shows its alt text instead. An <img> with no source at all (no src, no usable srcset or
// <picture> source) is complete with naturalWidth 0; one still loading is not complete. An SVG without intrinsic size
// can also report naturalWidth 0, so that case is decoded to be sure. An <input type=image> exposes no load state, so
// its image is decoded again (from cache) to find out.
async function altShown(el: HTMLImageElement | HTMLInputElement): Promise<boolean> {
  if (!el.alt.trim()) return false;
  if (el instanceof HTMLImageElement) {
    if (!el.complete) return true;
    if (el.naturalWidth > 0) return false;
    return !el.currentSrc || el.decode().then(() => false, () => true);
  }
  if (!el.getAttribute("src")) return true;
  const probe = new Image();
  probe.src = el.src;
  return probe.decode().then(() => false, () => true);
}

async function collectGenerated(): Promise<SidecarGenerated[]> {
  const out: SidecarGenerated[] = [];
  const add = (kind: SidecarGenerated["kind"], text: string, el: Element | null, box?: Box) => {
    const t = collapse(text);
    if (t) out.push({ kind, text: t, box: box ?? (el ? boxOf(el.getBoundingClientRect()) : EMPTY), chrome: !!el && !!composedClosest(el, "[data-chrome]") });
  };
  const rs = roots();
  const els = rs.flatMap((r) => Array.from(r.querySelectorAll("*")));
  const svgs: { url: string; el: Element | null; box?: Box }[] = [];
  const alts: (HTMLImageElement | HTMLInputElement)[] = [];

  for (const el of els) {
    const cs = getComputedStyle(el);
    const shows = visibleEl(el), r = el.getBoundingClientRect(), sized = r.width > 0 && r.height > 0;
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (!ps.content || ps.content === "none" || ps.content === "normal" || !pseudoShows(el, ps)) continue;
      const text = inks(ps, el) ? contentText(ps.content, el) : null;
      if (text) add("pseudo", text, el);
      for (const p of [...IMAGE_PROPS, "content"]) for (const url of cssUrls(ps.getPropertyValue(p))) svgs.push({ url, el });
    }
    if (!shows) continue;
    if (cs.display.includes("list-item")) {
      const ms = getComputedStyle(el, "::marker"), text = markerText(el, cs, ms);
      if (text && inks(ms, el)) add("marker", text, el);
    }
    for (const p of [...IMAGE_PROPS, "content"]) for (const url of cssUrls(cs.getPropertyValue(p))) svgs.push({ url, el });
    if (el instanceof HTMLImageElement || (el instanceof HTMLInputElement && el.type === "image")) alts.push(el);
    if (!sized) continue;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) add("form", formText(el), el);
    else if (el instanceof HTMLIFrameElement || el instanceof HTMLObjectElement || el instanceof HTMLEmbedElement) add("frame", frameText(el), el);
    else if (el instanceof HTMLImageElement) svgs.push({ url: el.currentSrc || el.src, el });
    else if (el instanceof HTMLVideoElement && el.poster) svgs.push({ url: el.poster, el });
    else if (el instanceof SVGImageElement && el.href.baseVal) svgs.push({ url: new URL(el.href.baseVal, document.baseURI).href, el });
    if (el instanceof HTMLInputElement && el.type === "image" && el.src) svgs.push({ url: el.src, el });
  }

  for (const el of alts) if (await altShown(el)) add("alt", el.alt, el);
  const patches = window.__shotsmithPatches!;
  for (const [canvas, texts] of patches.canvasTexts) {
    const inPage = canvas instanceof HTMLCanvasElement && canvas.isConnected;
    for (const text of texts) add("canvas", text, inPage ? canvas : null, inPage ? undefined : EMPTY);
  }
  for (const [canvas, urls] of patches.canvasImages) {
    const inPage = canvas instanceof HTMLCanvasElement && canvas.isConnected;
    for (const url of urls) svgs.push({ url, el: inPage ? canvas : null, box: inPage ? undefined : EMPTY });
  }

  const fetched = new Map<string, Promise<string[] | null>>();
  for (const s of svgs) if (s.url && isSvgUrl(s.url) && !fetched.has(s.url)) fetched.set(s.url, svgTexts(s.url));
  for (const s of svgs) {
    const texts = s.url && fetched.has(s.url) ? await fetched.get(s.url)! : [];
    for (const text of texts ?? [`unreadable SVG image ${s.url.slice(0, 80)}`]) add("svgImage", text, s.el, s.box);
  }

  // One entry per distinct thing shown (mask-image and -webkit-mask-image name the same image, for one).
  const seen = new Set<string>();
  return out.filter((g) => { const k = JSON.stringify(g); return !seen.has(k) && !!seen.add(k); });
}

// Layout is read once per call: the caches only live for one collection.
export async function collectEvidence(): Promise<{ texts: SidecarText[]; claimsShown: SidecarClaimShown[]; generated: SidecarGenerated[] }> {
  for (const m of [textInfos, clipCache.own, clipCache.outer, claimOverflows]) m.clear();
  const texts = collectTexts(), claimsShown = collectClaimsShown(), generated = await collectGenerated();
  return { texts, claimsShown, generated };
}
