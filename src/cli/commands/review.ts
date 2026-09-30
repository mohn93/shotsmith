import type { Command } from "commander";
import { loadConfig } from "../../config/schema.js";
import { strip } from "../../review/strip.js";
import { thumbs } from "../../review/thumbs.js";
import { configuredLocale, configuredTarget, globals, intInRange, oneOf } from "../output.js";

export function registerReview(program: Command) {
  program.command("thumbs <target>").description("one row of every screen at a fixed width, for review")
    .option("-l, --locale <code>").option("--width <px>", "tile width", "300").option("--from <dir>", "out or export", "out")
    .action(async (target: string, o, cmd: Command) => {
      const g = globals(cmd);
      const width = intInRange("--width", String(o.width), 50, 2000), from = oneOf("--from", String(o.from), ["out", "export"] as const);
      const cfg = loadConfig(g.cwd);
      const file = await thumbs(cfg, { target: configuredTarget(cfg, target), locale: o.locale === undefined ? undefined : configuredLocale(cfg, o.locale), width, from });
      console.log(g.json ? JSON.stringify({ ok: true, file }) : `wrote ${file}`);
    });
  program.command("strip <target>").description("join a panorama's screens and check every seam")
    .option("-l, --locale <code>").option("--warn-only", "exit 0 even when a seam steps")
    .action(async (target: string, o, cmd: Command) => {
      const g = globals(cmd);
      const cfg = loadConfig(g.cwd);
      const res = await strip(cfg, { target: configuredTarget(cfg, target), locale: o.locale === undefined ? undefined : configuredLocale(cfg, o.locale) });
      const failed = res.seams.some((s) => s.steps.length) && !o.warnOnly;
      if (g.json) console.log(JSON.stringify({ ok: !failed, ...res }));
      else {
        for (const s of res.seams) console.log(`seam ${s.between.join(" | ")}: ${s.steps.length ? `STEP at ${s.steps.map((x) => `y ${x.from}-${x.to} (up to ${x.max}/255)`).join(", ")}` : "continuous"}`);
        console.log(`wrote ${res.file}`);
      }
      if (failed) process.exitCode = 1;
    });
}
