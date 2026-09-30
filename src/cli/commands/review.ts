import type { Command } from "commander";
import { loadConfig } from "../../config/schema.js";
import { strip } from "../../review/strip.js";
import { thumbs } from "../../review/thumbs.js";
import { globals } from "../output.js";

export function registerReview(program: Command) {
  program.command("thumbs <target>").description("one row of every screen at a fixed width, for review")
    .option("-l, --locale <code>").option("--width <px>", "tile width", "300").option("--from <dir>", "out or export", "out")
    .action(async (target: string, o, cmd: Command) => {
      const g = globals(cmd);
      const file = await thumbs(loadConfig(g.cwd), { target, locale: o.locale, width: Number(o.width), from: o.from });
      console.log(g.json ? JSON.stringify({ file }) : `wrote ${file}`);
    });
  program.command("strip <target>").description("join a panorama's screens and check every seam")
    .option("-l, --locale <code>").option("--warn-only", "exit 0 even when a seam steps")
    .action(async (target: string, o, cmd: Command) => {
      const g = globals(cmd);
      const res = await strip(loadConfig(g.cwd), { target, locale: o.locale });
      const stepped = res.seams.filter((s) => s.steps.length);
      if (g.json) console.log(JSON.stringify(res, null, 2));
      else {
        for (const s of res.seams) console.log(`seam ${s.between.join(" | ")}: ${s.steps.length ? `STEP at ${s.steps.map((x) => `y ${x.from}-${x.to} (up to ${x.max}/255)`).join(", ")}` : "continuous"}`);
        console.log(`wrote ${res.file}`);
      }
      if (stepped.length && !o.warnOnly) process.exitCode = 1;
    });
}
