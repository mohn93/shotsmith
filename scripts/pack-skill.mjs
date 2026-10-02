// Packs skills/store-screenshots into release/store-screenshots-<version>.zip for upload to claude.ai.
// The zip holds one folder, store-screenshots/, with SKILL.md inside it.
//   node scripts/pack-skill.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function packSkill(root) {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const out = path.join(root, "release", `store-screenshots-${version}.zip`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.rmSync(out, { force: true });
  // -X leaves out extra file attributes, so the zip depends only on the files.
  const r = spawnSync("zip", ["-r", "-X", "-q", out, "store-screenshots", "-x", "*.DS_Store"], { cwd: path.join(root, "skills"), encoding: "utf8" });
  if (r.error) throw new Error(`zip is not installed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`zip failed (exit ${r.status}): ${r.stderr.trim()}`);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(packSkill(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")));
}
