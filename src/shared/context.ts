import type { Target } from "../config/targets.js";

export interface FontFaceSpec { weight: string; url: string }
export interface KitContext {
  page: string;
  target: Target;
  locale: { code: string; dir: "ltr" | "rtl"; apple?: string; play?: string };
  defaultLocale: string;
  fonts: Record<string, { family: string; faces: FontFaceSpec[] }>;
  captures: { statusBar: "included" | "none"; pointWidth: number | null; files: Record<string, { url: string; fallback: boolean }> };
  claims: Record<string, string>;
  warnings: string[];
}
