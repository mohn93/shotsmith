import { Command } from "commander";
import { version } from "../shared/paths.js";

const program = new Command()
  .name("shotsmith")
  .version(version())
  .option("-C, --cwd <dir>", "workspace folder", process.cwd())
  .option("--json", "machine-readable output");

program.parseAsync().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
