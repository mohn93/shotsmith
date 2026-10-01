import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { packageRoot } from "../shared/paths.js";

export const SKILL_NAME = "store-screenshots";
export const skillDir = (): string => path.join(packageRoot(), "skills", SKILL_NAME);
export const defaultSkillsHome = (): string => path.join(os.homedir(), ".claude", "skills");

const lstat = (p: string): fs.Stats | null => { try { return fs.lstatSync(p); } catch { return null; } };

// Copies the bundled skill to <dir>/store-screenshots. An existing copy is replaced only with force, and only when it
// is a real folder holding a SKILL.md. The new copy is staged next to it; the old copy is set aside, the staged one
// renamed in, and the old one removed, so a failure puts the old copy back. Staging folders left by a crashed install
// are removed first: they hold a SKILL.md and could be read as a duplicate skill.
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
  for (const n of fs.readdirSync(home)) if (n.startsWith(`.${SKILL_NAME}-`)) fs.rmSync(path.join(home, n), { recursive: true, force: true });
  const staged = fs.mkdtempSync(path.join(home, `.${SKILL_NAME}-`));
  const backup = path.join(home, `.${SKILL_NAME}-old-${process.pid}-${Date.now().toString(36)}`);
  let setAside = false;
  try {
    fs.cpSync(skillDir(), staged, { recursive: true });
    if (st) { fs.renameSync(dest, backup); setAside = true; }
    fs.renameSync(staged, dest);
  } catch (e) {
    if (setAside && !lstat(dest)) fs.renameSync(backup, dest);
    fs.rmSync(staged, { recursive: true, force: true });
    throw e;
  }
  if (setAside) fs.rmSync(backup, { recursive: true, force: true });
  return { path: dest, replaced: !!st };
}
