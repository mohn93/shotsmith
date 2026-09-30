import path from "node:path";
import type { Command } from "commander";
import { type Finding, formatFinding } from "../checks/findings.js";

export interface GlobalOpts { cwd: string; json?: boolean }
export const globals = (cmd: Command): GlobalOpts => {
  const o = cmd.optsWithGlobals() as GlobalOpts;
  return { ...o, cwd: path.resolve(o.cwd) };
};

export function printFindings(findings: Finding[], json: boolean, extra: Record<string, unknown> = {}): number {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  if (json) console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings, ...extra }, null, 2));
  else {
    for (const f of [...errors, ...warnings]) console.log(formatFinding(f));
    console.log(errors.length ? `${errors.length} error(s), ${warnings.length} warning(s)` : `No errors, ${warnings.length} warning(s)`);
  }
  return errors.length ? 1 : 0;
}
