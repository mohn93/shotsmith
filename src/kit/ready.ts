import type { SidecarFont, SidecarText } from "../shared/sidecar.js";
import { ctx, fail, state } from "./runtime.js";

function visible(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
  }
  return true;
}

function cssImageUrls(): string[] {
  const urls = new Set<string>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
    const cs = getComputedStyle(el);
    for (const v of [cs.backgroundImage, cs.maskImage, (cs as any).webkitMaskImage as string]) {
      for (const m of (v ?? "").matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]);
    }
  }
  return [...urls];
}

function shortUrl(u: string): string {
  try {
    const x = new URL(u, location.href);
    return x.origin === location.origin ? x.pathname + x.search : u;
  } catch { return u; }
}

async function settle(): Promise<void> {
  await Promise.all(state.pending);
  await document.fonts.ready;
  const failed: string[] = [];
  const imgs = Array.from(document.images).filter((i) => i.getAttribute("src"));
  await Promise.all(imgs.map((i) => i.decode().catch(() => { failed.push(shortUrl(i.getAttribute("src")!)); })));
  await Promise.all(cssImageUrls().map((u) => { const i = new Image(); i.src = u; return i.decode().catch(() => { failed.push(shortUrl(u)); }); }));
  if (failed.length) throw new Error(`Image failed to load: ${[...new Set(failed)].join(", ")}`);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function collectTexts(): SidecarText[] {
  const out: SidecarText[] = [];
  const W = innerWidth, H = innerHeight;
  const ids = new Map<Element, number>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    const el = n.parentElement;
    if (!text || !el || el.closest("script,style,template,noscript") || !visible(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (!ids.has(el)) { ids.set(el, ids.size); el.setAttribute("data-sx", String(ids.get(el))); }
    const claimEl = el.closest<HTMLElement>("[data-claim]");
    // A line-height below the font's content area (headlines use ~1.08) makes the last line's inline box spill a few px below the element.
    // That is not an overflow, so vertical overflow gets a quarter-em of slack.
    const slackY = claimEl ? 1 + 0.25 * (parseFloat(getComputedStyle(claimEl).fontSize) || 0) : 1;
    const overflow = !!claimEl && (claimEl.dataset.overflow === "1" ||
      (claimEl.clientWidth > 0 && (claimEl.scrollWidth > claimEl.clientWidth + 1 || claimEl.scrollHeight > claimEl.clientHeight + slackY)));
    out.push({
      el: ids.get(el)!,
      claim: claimEl?.dataset.claim ?? null,
      chrome: !!el.closest("[data-chrome]"),
      text,
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      font: getComputedStyle(el).fontFamily,
      overflow,
      clipped: r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5,
      safeArea: r.top < H * 0.04 || r.bottom > H * 0.96,
      shrink: claimEl?.dataset.shrink ? Number(claimEl.dataset.shrink) : null,
      covered: true,
      fallbackFonts: [],
    });
  }
  return out;
}

function collectFonts(): SidecarFont[] {
  return Object.values(ctx().fonts).flatMap((f) => f.faces.map((face) => ({
    family: f.family, weight: face.weight, url: face.url,
    status: document.fonts.check(`${face.weight.split(" ")[0]} 40px "${f.family}"`) ? "loaded" as const : "unloaded" as const,
  })));
}

export async function ready(): Promise<void> {
  try {
    await settle();
    const c = ctx();
    window.__shotsmithSidecar = {
      page: c.page, target: c.target.name, locale: c.locale.code, kit: true,
      texts: collectTexts(), fonts: collectFonts(), captures: [...state.captures], devices: state.devices,
      lifts: state.lifts, warnings: state.warnings,
    };
    window.__ready = true;
  } catch (e) {
    fail(e);
  }
}
