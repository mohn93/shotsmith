import fs from "node:fs";
import { formatFinding } from "../checks/findings.js";
import { checkExports, exportPath } from "../checks/store.js";
import type { LocaleConfig, ResolvedConfig } from "../config/schema.js";
import type { Target } from "../config/targets.js";
import { STORE_NAME, md5, rel, sha256 } from "./util.js";

export type Store = "apple" | "play";
export interface LocalFile { page: string; file: string; rel: string; bytes: number; md5: string; sha256: string }
// One store slot for one locale. An Android tablet target fills two slots with the same files.
export interface LocalSet { locale: string; storeLocale: string; target: string; slot: string; files: LocalFile[] }

// App Store display types by portrait size. Landscape is the same pair swapped.
const APPLE_DISPLAY: [Target["platform"], number, number, string][] = [
  ["iphone", 1320, 2868, "APP_IPHONE_67"], ["iphone", 1290, 2796, "APP_IPHONE_67"], ["iphone", 1260, 2736, "APP_IPHONE_67"],
  ["iphone", 1242, 2688, "APP_IPHONE_65"], ["iphone", 1284, 2778, "APP_IPHONE_65"],
  ["ipad", 2064, 2752, "APP_IPAD_PRO_3GEN_129"], ["ipad", 2048, 2732, "APP_IPAD_PRO_3GEN_129"],
];

export function slotsFor(t: Target): string[] {
  if (t.platform === "android-phone") return ["phoneScreenshots"];
  if (t.platform === "android-tablet") return ["sevenInchScreenshots", "tenInchScreenshots"];
  const hit = APPLE_DISPLAY.find(([p, w, h]) => p === t.platform && ((t.w === w && t.h === h) || (t.w === h && t.h === w)));
  return hit ? [hit[3]] : [];
}

export const storeLocale = (l: LocaleConfig, store: Store): string => (store === "apple" ? l.apple : l.play) ?? l.code;

// The exports to upload to one store, one set per locale and slot, in page order. When anything is wrong the
// problems are returned and no sets: only an export that passes every store check is uploaded.
export async function localSets(cfg: ResolvedConfig, store: Store, o: { locales?: string[] } = {}): Promise<{ sets: LocalSet[]; problems: string[] }> {
  const unknown = (o.locales ?? []).filter((c) => !cfg.locales.some((l) => l.code === c));
  if (unknown.length) throw new Error(`Unknown locale(s): ${unknown.join(", ")}; configured: ${cfg.locales.map((l) => l.code).join(", ")}`);
  const locales = cfg.locales.filter((l) => !o.locales?.length || o.locales.includes(l.code));
  const targets = cfg.targets.filter((t) => t.store === store);
  if (!targets.length) throw new Error(`shotsmith.config.json has no ${STORE_NAME[store]} targets`);

  const problems: string[] = [];
  const slotOwner = new Map<string, string>();
  for (const t of targets) {
    const slots = slotsFor(t);
    if (!slots.length) problems.push(`Target "${t.name}" (${t.w}x${t.h}) has no App Store display type Shotsmith uploads to; use iphone-6.9, iphone-6.5 or ipad-13, or upload it by hand`);
    for (const s of slots) {
      const prev = slotOwner.get(s);
      if (prev) problems.push(`Targets "${prev}" and "${t.name}" both fill ${s}; keep one of them`);
      else slotOwner.set(s, t.name);
    }
  }
  const languageOwner = new Map<string, string>();
  for (const l of locales) {
    const code = storeLocale(l, store), prev = languageOwner.get(code);
    if (prev) problems.push(`Locales "${prev}" and "${l.code}" both map to ${STORE_NAME[store]} language ${code}`);
    else languageOwner.set(code, l.code);
  }
  for (const f of await checkExports(cfg)) {
    if (f.severity !== "error") continue;
    if (f.target && !targets.some((t) => t.name === f.target)) continue;
    if (f.locale && !locales.some((l) => l.code === f.locale)) continue;
    problems.push(`${formatFinding(f)} (run shotsmith build and fix its errors first)`);
  }
  if (problems.length) return { sets: [], problems };

  const sets: LocalSet[] = [];
  for (const l of locales) for (const t of targets) {
    const files = cfg.pages.map((page): LocalFile => {
      const file = exportPath(cfg, l.code, t.name, page);
      const bytes = fs.readFileSync(file);
      return { page, file, rel: rel(cfg, file), bytes: bytes.length, md5: md5(bytes), sha256: sha256(bytes) };
    });
    for (const slot of slotsFor(t)) sets.push({ locale: l.code, storeLocale: storeLocale(l, store), target: t.name, slot, files });
  }
  return { sets, problems };
}
