export interface SidecarText {
  el: number; claim: string | null; chrome: boolean; text: string; box: [number, number, number, number]; font: string;
  overflow: boolean; clipped: boolean; safeArea: boolean; shrink: number | null; covered: boolean; fallbackFonts: string[];
}
export interface SidecarFont { family: string; weight: string; url: string; status: "loaded" | "unloaded" }
export interface SidecarDevice { platform: string; capture: string; statusBar: "included" | "none"; repaint: boolean; screen: [number, number] }
export interface Sidecar {
  page: string; target: string; locale: string; kit: boolean;
  texts: SidecarText[]; fonts: SidecarFont[]; captures: string[]; devices: SidecarDevice[]; lifts: number; warnings: string[];
}

export const emptySidecar = (page: string, target: string, locale: string, warning: string): Sidecar => ({
  page, target, locale, kit: false, texts: [], fonts: [], captures: [], devices: [], lifts: 0, warnings: [warning],
});
