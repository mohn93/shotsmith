export type Platform = "iphone" | "ipad" | "android-phone" | "android-tablet";
export type Store = "apple" | "play";
export type FormFactor = "tall" | "p916" | "t43" | "t916";
export interface Target { name: string; w: number; h: number; platform: Platform; store: Store; formFactor: FormFactor }

export const PLATFORMS: Platform[] = ["iphone", "ipad", "android-phone", "android-tablet"];

export const BUILT_IN_TARGETS: Record<string, Omit<Target, "name">> = {
  "iphone-6.9": { w: 1290, h: 2796, platform: "iphone", store: "apple", formFactor: "tall" },
  "iphone-6.5": { w: 1242, h: 2688, platform: "iphone", store: "apple", formFactor: "tall" },
  "ipad-13": { w: 2064, h: 2752, platform: "ipad", store: "apple", formFactor: "t43" },
  "android-phone": { w: 1080, h: 1920, platform: "android-phone", store: "play", formFactor: "p916" },
  "android-tablet": { w: 1440, h: 2560, platform: "android-tablet", store: "play", formFactor: "t916" },
};

export const storeOf = (p: Platform): Store => (p === "iphone" || p === "ipad" ? "apple" : "play");

export function formFactorOf(w: number, h: number, platform: Platform): FormFactor {
  const ratio = Math.max(w, h) / Math.min(w, h);
  if (ratio < 1.5) return "t43";
  if (ratio >= 2.1) return "tall";   // modern iPhones are ~2.17; 2:1 Android phones stay p916
  return platform === "android-tablet" || platform === "ipad" ? "t916" : "p916";
}

// Screenshot sizes App Store Connect accepts, as portrait pairs. Landscape is the same pair swapped.
export const APPLE_SIZES: { iphone: [number, number][]; ipad: [number, number][] } = {
  iphone: [[1260, 2736], [1290, 2796], [1320, 2868], [1242, 2688], [1284, 2778], [1179, 2556], [1206, 2622], [1125, 2436], [1170, 2532], [1080, 2340], [1242, 2208], [750, 1334], [640, 1096], [640, 1136], [640, 920], [640, 960]],
  ipad: [[2064, 2752], [2048, 2732], [1488, 2266], [1668, 2420], [1668, 2388], [1640, 2360], [1668, 2224], [1536, 2008], [1536, 2048], [768, 1004], [768, 1024]],
};

export function isAcceptedAppleSize(platform: "iphone" | "ipad", w: number, h: number): boolean {
  return APPLE_SIZES[platform].some(([a, b]) => (w === a && h === b) || (w === b && h === a));
}

// SF and New York are licensed for Apple-platform mockups only. Matches a family, full or PostScript name.
export const isAppleOnlyFontName = (name: string): boolean => /^\.?(SF|New ?York)/i.test(name);
