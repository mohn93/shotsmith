import path from "node:path";
import type { Command } from "commander";
import { init } from "../../init/init.js";
import { globals } from "../output.js";

export function registerInit(program: Command) {
  program.command("init [dir]").description("create a screenshot workspace")
    .option("--app <name>", "app name")
    .option("--no-install", "skip npm install")
    .action(async (dir: string | undefined, o, cmd: Command) => {
      const g = globals(cmd);
      const res = await init(dir ? path.resolve(g.cwd, dir) : g.cwd, { app: o.app, install: o.install });
      if (g.json) { console.log(JSON.stringify({ ok: true, ...res })); return; }
      const rel = path.relative(process.cwd(), res.dir);
      console.log(`Created ${res.dir}`);
      console.log("Next:");
      if (rel !== "") console.log(`  cd ${/\s/.test(rel) ? JSON.stringify(rel) : rel}`);
      if (o.install === false) console.log("  npm install");
      console.log("  npx playwright install chromium   (once per machine)");
      console.log("  add captures to inputs/<platform>/<locale>/, then write brief.md and claims.json");
      console.log("  npx shotsmith build");
    });
}
