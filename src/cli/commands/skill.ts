import path from "node:path";
import type { Command } from "commander";
import { installSkill, skillDir } from "../../skill/skill.js";
import { globals } from "../output.js";

export function registerSkill(program: Command) {
  const skill = program.command("skill").description("the agent skill that drives Shotsmith");
  skill.command("path").description("print the folder of the bundled skill")
    .action((_o, cmd: Command) => {
      const g = globals(cmd), p = skillDir();
      console.log(g.json ? JSON.stringify({ ok: true, path: p }) : p);
    });
  skill.command("install").description("copy the skill to ~/.claude/skills, or to --dir")
    .option("--dir <dir>", "skills folder to install into")
    .option("--force", "replace an installed copy")
    .action((o, cmd: Command) => {
      const g = globals(cmd);
      const res = installSkill({ dir: o.dir === undefined ? undefined : path.resolve(g.cwd, o.dir), force: !!o.force });
      console.log(g.json ? JSON.stringify({ ok: true, ...res }) : `${res.replaced ? "Replaced" : "Installed"} ${res.path}`);
    });
}
