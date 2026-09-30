import { type SidecarFont, domHash, pageText } from "../shared/sidecar.js";
import { collectEvidence, cssUrls } from "./evidence.js";
import { ctx, fail, state } from "./runtime.js";

function cssImageUrls(): string[] {
  const urls = new Set<string>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
    const cs = getComputedStyle(el);
    for (const p of ["background-image", "mask-image", "-webkit-mask-image"]) for (const u of cssUrls(cs.getPropertyValue(p))) urls.add(u);
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
  // Images with a source (src, srcset or a <picture> source) must have loaded; one with none shows its alt text.
  const imgs = Array.from(document.images).filter((i) => i.getAttribute("src") || i.getAttribute("srcset") || i.parentElement?.localName === "picture");
  await Promise.all(imgs.map((i) => i.decode().catch(() => { failed.push(shortUrl(i.getAttribute("src") || i.currentSrc || "an image in a <picture>")); })));
  await Promise.all(cssImageUrls().map((u) => { const i = new Image(); i.src = u; return i.decode().catch(() => { failed.push(shortUrl(u)); }); }));
  if (failed.length) throw new Error(`Image failed to load: ${[...new Set(failed)].join(", ")}`);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
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
    const { texts, claimsShown, generated } = await collectEvidence();
    window.__shotsmithSidecar = {
      page: c.page, target: c.target.name, locale: c.locale.code, kit: true,
      texts, fonts: collectFonts(), captures: [...state.captures], devices: state.devices,
      lifts: state.lifts, warnings: state.warnings, generated, claimsShown,
    };
    window.__ready = true;
    // The renderer compares this after the screenshot to catch text added after ready().
    window.__shotsmithDomHash = domHash(pageText());
  } catch (e) {
    fail(e);
  }
}
