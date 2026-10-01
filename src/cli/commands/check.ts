import type { Command } from "commander";
import { checkInputs } from "../../checks/inputs.js";
import { checkSidecars, loadSidecars } from "../../checks/sidecars.js";
import { checkExports } from "../../checks/store.js";
import { loadConfig } from "../../config/schema.js";
import { globals, printFindings } from "../output.js";

export function registerCheck(program: Command) {
  program.command("check").description("check captures, renders and exports against store rules").action(async (_o, cmd: Command) => {
    const g = globals(cmd);
    const cfg = loadConfig(g.cwd);
    const { sidecars, findings } = loadSidecars(cfg);
    process.exitCode = printFindings([...checkInputs(cfg), ...findings, ...checkSidecars(cfg, sidecars), ...(await checkExports(cfg))], !!g.json);
  });
}
