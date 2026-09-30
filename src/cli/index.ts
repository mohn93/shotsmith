import { CommanderError, Command } from "commander";
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
  .option("-C, --cwd <dir>", "workspace folder (default: current directory)")
  .option("--json", "machine-readable output")
  // Usage errors are reported by the handler below so they follow the same exit code and JSON contract.
  .exitOverride()
  .configureOutput({ outputError: () => {} });

registerInit(program);
registerRender(program);
registerCheck(program);
registerClaims(program);
registerBuild(program);
registerReview(program);

// Exit 0 success, 1 error findings (set by the commands), 2 usage or runtime failure (here).
function fail(e: unknown): void {
  let message = e instanceof Error ? e.message : String(e);
  if (e instanceof CommanderError) {
    if (e.exitCode === 0) { process.exitCode = 0; return; }
    message = e.code === "commander.help" ? "No command given; see the usage on stderr" : message.replace(/^error: /, "");
  }
  const json = program.opts().json || process.argv.includes("--json");
  if (json) console.log(JSON.stringify({ ok: false, error: { message } }));
  else console.error(message);
  process.exitCode = 2;
}

program.parseAsync().catch(fail);
