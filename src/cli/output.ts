import path from "node:path";
import type { Command } from "commander";
import type { ResolvedConfig } from "../config/schema.js";
import { type Finding, formatFinding } from "../checks/findings.js";

export interface GlobalOpts { cwd: string; json?: boolean }
export const globals = (cmd: Command): GlobalOpts => {
  const o = cmd.optsWithGlobals() as { cwd?: string; json?: boolean };
  return { ...o, cwd: path.resolve(o.cwd ?? process.cwd()) };
};

// Throws a usage error that names the bad value and lists the allowed ones.
export function oneOf<T extends string>(flag: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`Unknown ${flag} "${value}"; allowed: ${allowed.join(", ")}`);
  return value as T;
}

export function configuredTarget(cfg: ResolvedConfig, name: string): string {
  return oneOf("target", name, cfg.targets.map((t) => t.name));
}

export function configuredLocale(cfg: ResolvedConfig, code: string): string {
  return oneOf("locale", code, cfg.locales.map((l) => l.code));
}

export function intInRange(flag: string, value: string, min: number, max: number): number {
  const n = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${flag} "${value}" must be a whole number from ${min} to ${max}`);
  return n;
}

export function printFindings(findings: Finding[], json: boolean, extra: Record<string, unknown> = {}): number {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  if (json) console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings, ...extra }));
  else {
    for (const f of [...errors, ...warnings]) console.log(formatFinding(f));
    console.log(errors.length ? `${errors.length} error(s), ${warnings.length} warning(s)` : `No errors, ${warnings.length} warning(s)`);
  }
  return errors.length ? 1 : 0;
}
