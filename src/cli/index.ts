import { Command } from "commander";
import { version } from "../shared/paths.js";
import { registerCheck } from "./commands/check.js";
import { registerRender } from "./commands/render.js";

const program = new Command()
  .name("shotsmith")
  .version(version())
  .option("-C, --cwd <dir>", "workspace folder", process.cwd())
  .option("--json", "machine-readable output");

registerRender(program);
registerCheck(program);

program.parseAsync().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
