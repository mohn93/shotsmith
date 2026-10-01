import type { Command } from "commander";
import { build } from "../../build/build.js";
import { loadConfig } from "../../config/schema.js";
import { globals, list, printFindings } from "../output.js";

export function registerBuild(program: Command) {
  program.command("build").description("render every page for every target and locale, export, and check")
    .option("-t, --target <names>", "limit to targets (repeat or comma-separate)", list)
    .option("-l, --locale <codes>", "limit to locales (repeat or comma-separate)", list)
    .option("--jobs <n>", "parallel renders", "4")
    .action(async (o, cmd: Command) => {
      const g = globals(cmd);
      const jobs = Number(o.jobs);
      if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`--jobs must be a whole number of 1 or more, got "${o.jobs}"`);
      const res = await build(loadConfig(g.cwd), { targets: o.target, locales: o.locale, jobs });
      if (!g.json) console.log(`rendered ${res.rendered.length}, failed ${res.failures.length}; report: ${res.report || "not written (the output folder or REPORT.md is a link)"}`);
      process.exitCode = printFindings(res.findings, !!g.json, { report: res.report, rendered: res.rendered.length });
    });
}
