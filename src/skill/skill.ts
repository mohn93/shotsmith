import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { packageRoot } from "../shared/paths.js";

export const SKILL_NAME = "store-screenshots";
export const skillDir = (): string => path.join(packageRoot(), "skills", SKILL_NAME);
export const defaultSkillsHome = (): string => path.join(os.homedir(), ".claude", "skills");

const lstat = (p: string): fs.Stats | null => { try { return fs.lstatSync(p); } catch { return null; } };

// Copies the bundled skill to <dir>/store-screenshots. An existing copy is replaced only with force, and only when it
// is a real folder holding a SKILL.md; the new copy is staged next to it and renamed in, so a failure leaves the old one.
export function installSkill(o: { dir?: string; force?: boolean } = {}): { path: string; replaced: boolean } {
  const home = path.resolve(o.dir ?? defaultSkillsHome());
  const dest = path.join(home, SKILL_NAME);
  const st = lstat(dest);
  if (st) {
    if (st.isSymbolicLink()) throw new Error(`${dest} is a link; remove it before installing`);
    if (!st.isDirectory() || !fs.existsSync(path.join(dest, "SKILL.md"))) throw new Error(`${dest} exists and is not a skill folder (no SKILL.md); move it away first`);
    if (!o.force) throw new Error(`${dest} already exists; pass --force to replace it`);
  }
  fs.mkdirSync(home, { recursive: true });
  const staged = fs.mkdtempSync(path.join(home, `.${SKILL_NAME}-`));
  try {
    fs.cpSync(skillDir(), staged, { recursive: true });
    if (st) fs.rmSync(dest, { recursive: true });
    fs.renameSync(staged, dest);
  } catch (e) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw e;
  }
  return { path: dest, replaced: !!st };
}
