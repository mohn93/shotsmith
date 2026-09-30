import type { Command } from "commander";
import { init } from "../../init/init.js";
import { globals } from "../output.js";

export function registerInit(program: Command) {
  program.command("init [dir]").description("create a screenshot workspace")
    .option("--app <name>", "app name")
    .option("--no-install", "skip npm install")
    .action(async (dir: string | undefined, o, cmd: Command) => {
      const g = globals(cmd);
      const res = await init(dir ?? g.cwd, { app: o.app, install: o.install });
      if (g.json) { console.log(JSON.stringify(res)); return; }
      console.log(`Created ${res.dir}`);
      console.log("Next: add captures to inputs/<platform>/<locale>/, write claims.json and brief.md, then run:");
      console.log("  npx playwright install chromium   (once)");
      console.log("  npx shotsmith build");
    });
}
