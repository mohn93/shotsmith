import { Command } from "commander";
import { version } from "../shared/paths.js";
import { registerBuild } from "./commands/build.js";
import { registerCheck } from "./commands/check.js";
import { registerClaims } from "./commands/claims.js";
import { registerInit } from "./commands/init.js";
import { registerRender } from "./commands/render.js";
import { registerReview } from "./commands/review.js";

const program = new Command()
  .name("shotsmith")
  .version(version())
  .option("-C, --cwd <dir>", "workspace folder", process.cwd())
  .option("--json", "machine-readable output");

registerInit(program);
registerRender(program);
registerCheck(program);
registerClaims(program);
registerBuild(program);
registerReview(program);

program.parseAsync().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
