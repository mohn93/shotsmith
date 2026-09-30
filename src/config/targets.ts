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
