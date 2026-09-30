import type { Command } from "commander";
import { checkClaims } from "../../checks/claims.js";
import { loadSidecars } from "../../checks/sidecars.js";
import { loadClaims } from "../../config/claims.js";
import { loadConfig } from "../../config/schema.js";
import { globals, printFindings } from "../output.js";

export function registerClaims(program: Command) {
  program.command("claims").description("check that every visible word comes from claims.json with a source").action(async (_o, cmd: Command) => {
    const g = globals(cmd);
    const cfg = loadConfig(g.cwd);
    const { sidecars, findings } = loadSidecars(cfg);
    process.exitCode = printFindings([...findings, ...checkClaims(cfg, loadClaims(cfg.root), sidecars)], !!g.json);
  });
}
