import { CommanderError, Command } from "commander";
import { version } from "../shared/paths.js";
import { registerBuild } from "./commands/build.js";
import { registerCheck } from "./commands/check.js";
import { registerClaims } from "./commands/claims.js";
import { registerInit } from "./commands/init.js";
import { registerRender } from "./commands/render.js";
import { registerReview } from "./commands/review.js";
import { registerSkill } from "./commands/skill.js";

// Read from argv, since --help and --version stop parsing before options are known.
const wantsJson = () => process.argv.slice(2).includes("--json");
// Under --json, help and version text is held back and printed as one JSON object by the handler below.
let heldOut = "";

const program = new Command()
  .name("shotsmith")
  .version(version())
  .option("-C, --cwd <dir>", "workspace folder (default: current directory)")
  .option("--json", "machine-readable output")
  // Usage errors are reported by the handler below so they follow the same exit code and JSON contract.
  .exitOverride()
  .configureOutput({ outputError: () => {}, writeOut: (s) => { if (wantsJson()) heldOut += s; else process.stdout.write(s); } });

registerInit(program);
registerRender(program);
registerCheck(program);
registerClaims(program);
registerBuild(program);
registerReview(program);
registerSkill(program);

// Exit 0 success, 1 error findings (set by the commands), 2 usage or runtime failure (here).
function fail(e: unknown): void {
  let message = e instanceof Error ? e.message : String(e);
  const json = wantsJson();
  if (e instanceof CommanderError) {
    // --version and --help: exit 0, and under --json one JSON object instead of the text.
    if (e.exitCode === 0) {
      if (json) console.log(JSON.stringify(e.code === "commander.version" ? { ok: true, version: version() } : { ok: true, help: heldOut }));
      process.exitCode = 0;
      return;
    }
    message = e.code === "commander.help" ? "No command given; see the usage on stderr" : message.replace(/^error: /, "");
  }
  if (json) console.log(JSON.stringify({ ok: false, error: { message } }));
  else console.error(message);
  process.exitCode = 2;
}

program.parseAsync().catch(fail);
