import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BUILT_IN_TARGETS, PLATFORMS, type Target, formFactorOf, storeOf } from "./targets.js";

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`shotsmith.config.json has problems:\n- ${problems.join("\n- ")}`);
  }
}

// Apple's SF and New York fonts are licensed for Apple-platform mockups only.
export const APPLE_ONLY_FONT = /^sysfont:(SF-|SFNS|SFCompact|NewYork)/i;

const FontSource = z.union([z.string().min(1), z.record(z.string().regex(/^\d{3}$/), z.string().min(1))]);
const FontRole = z.object({ apple: FontSource.optional(), play: FontSource.optional(), fallback: FontSource.optional() });
const CustomTarget = z.object({
  name: z.string().regex(/^[\w.-]+$/),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  platform: z.enum(PLATFORMS as [string, ...string[]]),
  formFactor: z.enum(["tall", "p916", "t43", "t916"]).optional(),
});
const Locale = z.object({
  code: z.string().min(2),
  apple: z.string().optional(),
  play: z.string().optional(),
  dir: z.enum(["ltr", "rtl"]).default("ltr"),
  fonts: z.record(z.string(), FontSource).default({}),
});
const Schema = z.object({
  app: z.string().min(1),
  apple: z.object({ bundleId: z.string().min(1) }).optional(),
  play: z.object({ packageName: z.string().min(1) }).optional(),
  pages: z.array(z.string().regex(/^[\w-]+$/)).min(1),
  targets: z.array(z.union([z.string(), CustomTarget])).min(1),
  locales: z.array(Locale).min(1),
  fonts: z.record(z.string().regex(/^[a-z][\w-]*$/), FontRole).default({}),
  captures: z.record(z.string(), z.object({ statusBar: z.enum(["included", "none"]).default("none"), pointWidth: z.number().positive().optional() })).default({}),
  output: z.string().default("export"),
});

type Parsed = z.infer<typeof Schema>;
export type FontSource = z.infer<typeof FontSource>;
export type LocaleConfig = Parsed["locales"][number];
export interface ResolvedConfig extends Omit<Parsed, "targets"> { root: string; targets: Target[]; defaultLocale: string }

const sources = (s: FontSource | undefined): string[] => (s === undefined ? [] : typeof s === "string" ? [s] : Object.values(s));

export function loadConfig(root: string): ResolvedConfig {
  const file = path.join(root, "shotsmith.config.json");
  if (!fs.existsSync(file)) throw new ConfigError([`No shotsmith.config.json in ${root}`]);
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new ConfigError([`Invalid JSON: ${(e as Error).message}`]); }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
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
      targets.push({ name: t.name, w: t.w, h: t.h, platform, store: storeOf(platform), formFactor: t.formFactor ?? formFactorOf(t.w, t.h, platform) });
    }
  }
  const names = targets.map((t) => t.name);
  for (const n of names.filter((n, i) => names.indexOf(n) !== i)) problems.push(`Duplicate target "${n}"`);
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
