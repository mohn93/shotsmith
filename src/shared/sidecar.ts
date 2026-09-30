export interface SidecarText {
  el: number; claim: string | null; chrome: boolean; text: string; box: [number, number, number, number]; font: string;
  overflow: boolean; clipped: boolean; safeArea: boolean; shrink: number | null; covered: boolean; fallbackFonts: string[];
  // Code points (U+XXXX) no face of the configured font has a glyph for; Chromium draws them as tofu or with a system font.
  missingGlyphs?: string[];
}
export interface SidecarFont { family: string; weight: string; url: string; status: "loaded" | "unloaded" }
export interface SidecarDevice { platform: string; capture: string; statusBar: "included" | "none"; repaint: boolean; screen: [number, number] }
// What the kit reports from the page (window.__shotsmithSidecar).
export interface KitSidecar {
  page: string; target: string; locale: string; kit: boolean;
  texts: SidecarText[]; fonts: SidecarFont[]; captures: string[]; devices: SidecarDevice[]; lifts: number; warnings: string[];
}
// The renderer adds what the page cannot report about itself.
export interface Sidecar extends KitSidecar {
  // URL paths the page requested under /inputs/, and every font request.
  requests: { captures: string[]; fonts: string[] };
  // The page's DOM changed between ready() and the screenshot.
  changedAfterReady: boolean;
}

// The sidecar sits next to its image as <name>.sidecar.json, so it never collides with a workspace file like claims.json.
export const sidecarPath = (pngPath: string): string => pngPath.replace(/\.png$/, "") + ".sidecar.json";

// A short hash of document.body.innerHTML; the kit stores it at ready() and the renderer compares after the screenshot.
export function domHash(html: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < html.length; i++) h = Math.imul(h ^ html.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const emptySidecar = (page: string, target: string, locale: string, warning: string): Sidecar => ({
  page, target, locale, kit: false, texts: [], fonts: [], captures: [], devices: [], lifts: 0, warnings: [warning],
  requests: { captures: [], fonts: [] }, changedAfterReady: false,
});
