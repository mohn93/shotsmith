import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { APPLE_SIZES, BUILT_IN_TARGETS, PLATFORMS, type Target, formFactorOf, isAcceptedAppleSize, storeOf } from "./targets.js";

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`shotsmith.config.json has problems:\n- ${problems.join("\n- ")}`);
  }
}

// Apple's SF and New York fonts are licensed for Apple-platform mockups only.
export const APPLE_ONLY_FONT = /^sysfont:(\.?SF|New ?York)/i;

const FontSource = z.union([z.string().min(1), z.record(z.string().regex(/^\d{3}$/), z.string().min(1))]);
const FontRole = z.strictObject({ apple: FontSource.optional(), play: FontSource.optional(), fallback: FontSource.optional() });
const CustomTarget = z.strictObject({
  // Target names become folder names under out/ and export/.
  name: z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/, "use letters, digits, _, - and . only, and do not start with a dot"),
  w: z.number().int().min(320).max(8192),
  h: z.number().int().min(320).max(8192),
  platform: z.enum(PLATFORMS as [string, ...string[]]),
  formFactor: z.enum(["tall", "p916", "t43", "t916"]).optional(),
});
const Locale = z.strictObject({
  // Locale codes become folder names under out/, export/ and inputs/.
  code: z.string().min(2).regex(/^[A-Za-z0-9_-]+$/, "use letters, digits, - and _ only"),
  apple: z.string().optional(),
  play: z.string().optional(),
  dir: z.enum(["ltr", "rtl"]).default("ltr"),
  fonts: z.record(z.string(), FontSource).default({}),
});
// Folders Shotsmith owns or reads, which an output folder must not be or sit inside.
const RESERVED_OUTPUT = ["inputs", "out", "pages", "fonts", "review", "node_modules"];
const OutputPath = z.string().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (path.posix.isAbsolute(v) || path.win32.isAbsolute(v)) return fail("must be a relative path inside the project");
  const parts = v.split(/[\\/]+/).filter((p) => p !== "" && p !== ".");
  if (parts.includes("..")) return fail('must not contain ".."');
  if (!parts.length) return fail("must be a folder inside the project, not the project root");
  const bad = parts.find((p) => RESERVED_OUTPUT.includes(p.toLowerCase()));
  if (bad) return fail(`must not be or sit inside "${bad}", which Shotsmith uses for other files`);
});
const PageId = z.string().regex(/^[A-Za-z0-9_-]+$/, "use letters, digits, - and _ only");
const Schema = z.strictObject({
  app: z.string().min(1),
  apple: z.strictObject({ bundleId: z.string().min(1) }).optional(),
  play: z.strictObject({ packageName: z.string().min(1) }).optional(),
  pages: z.array(PageId).min(1),
  targets: z.array(z.union([z.string(), CustomTarget])).min(1),
  locales: z.array(Locale).min(1),
  fonts: z.record(z.string().regex(/^[a-z][\w-]*$/), FontRole).default({}),
  captures: z.record(z.string(), z.strictObject({ statusBar: z.enum(["included", "none"]).default("none"), pointWidth: z.number().positive().optional() })).default({}).superRefine((caps, ctx) => {
    for (const k of Object.keys(caps)) if (!PLATFORMS.includes(k as Target["platform"])) ctx.addIssue({ code: "custom", path: [k], message: `unknown platform; use one of ${PLATFORMS.join(", ")}` });
  }),
  output: OutputPath.default("export"),
});

type Parsed = z.infer<typeof Schema>;
export type FontSource = z.infer<typeof FontSource>;
export type LocaleConfig = Parsed["locales"][number];
export interface ResolvedConfig extends Omit<Parsed, "targets"> { root: string; targets: Target[]; defaultLocale: string }

const sources = (s: FontSource | undefined): string[] => (s === undefined ? [] : typeof s === "string" ? [s] : Object.values(s));

// A union hides its real errors. For a custom target (an object) report the object branch's issues instead.
function describe(i: z.core.$ZodIssue, raw: unknown): string[] {
  if (i.code === "invalid_union" && typeof at(raw, i.path) === "object") {
    const branch = i.errors.at(-1) ?? [];
    if (branch.length) return branch.flatMap((b) => describe({ ...b, path: [...i.path, ...b.path] }, raw));
  }
  if (i.code === "unrecognized_keys") return [`${i.path.join(".") || "(root)"}: unknown key ${i.keys.map((k) => `"${k}"`).join(", ")}`];
  return [`${i.path.join(".") || "(root)"}: ${i.message}`];
}
const at = (v: unknown, p: PropertyKey[]): unknown => p.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<PropertyKey, unknown>)[k] : undefined), v);

export function loadConfig(root: string): ResolvedConfig {
  const file = path.join(root, "shotsmith.config.json");
  if (!fs.existsSync(file)) throw new ConfigError([`No shotsmith.config.json in ${root}`]);
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new ConfigError([`Invalid JSON: ${(e as Error).message}`]); }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(parsed.error.issues.flatMap((i) => describe(i, raw)));
  const c = parsed.data;
  const problems: string[] = [];

  const targets: Target[] = [];
  for (const t of c.targets) {
    if (typeof t === "string") {
      const b = BUILT_IN_TARGETS[t];
      if (!b) problems.push(`Unknown target "${t}". Built-in targets: ${Object.keys(BUILT_IN_TARGETS).join(", ")}`);
      else targets.push({ name: t, ...b });
    } else {
      const platform = t.platform as Target["platform"];
      if ((platform === "iphone" || platform === "ipad") && !isAcceptedAppleSize(platform, t.w, t.h)) {
        const ok = APPLE_SIZES[platform].map(([w, h]) => `${w}x${h}`).join(", ");
        problems.push(`Target "${t.name}" is ${t.w}x${t.h}, which App Store Connect does not accept for ${platform} (portrait or landscape). Accepted sizes: ${ok}`);
      }
      targets.push({ name: t.name, w: t.w, h: t.h, platform, store: storeOf(platform), formFactor: t.formFactor ?? formFactorOf(t.w, t.h, platform) });
    }
  }
  const names = targets.map((t) => t.name);
  for (const n of names.filter((n, i) => names.indexOf(n) !== i)) problems.push(`Duplicate target "${n}"`);
  for (const p of c.pages.filter((x, i) => c.pages.indexOf(x) !== i)) problems.push(`Duplicate page "${p}"`);
  const codes = c.locales.map((l) => l.code);
  for (const code of codes.filter((x, i) => codes.indexOf(x) !== i)) problems.push(`Duplicate locale "${code}"`);

  const hasPlay = targets.some((t) => t.store === "play");
  for (const [role, r] of Object.entries(c.fonts)) {
    for (const s of [...sources(r.play), ...sources(r.fallback)]) {
      if (APPLE_ONLY_FONT.test(s)) problems.push(`fonts.${role}: ${s} is licensed for Apple platforms only and cannot be used for Google Play or as a fallback`);
    }
  }
  if (hasPlay) {
    for (const l of c.locales) for (const [role, s] of Object.entries(l.fonts)) for (const v of sources(s)) {
      if (APPLE_ONLY_FONT.test(v)) problems.push(`locales.${l.code}.fonts.${role}: ${v} is Apple-only, and this project has Google Play targets`);
    }
  }
  if (problems.length) throw new ConfigError(problems);
  return { ...c, root, targets, defaultLocale: c.locales[0].code };
}
