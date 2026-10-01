// Builds the examples with this checkout's CLI (run `npm run build` first).
//   node scripts/build-examples.mjs [app ...]
// Runs `npm ci` in an example that has a lockfile and no node_modules, then `shotsmith build --json`.
// Exits 1 when any example reports an error or a warning, 2 on a crash or an unknown example.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist/cli.js");
if (!fs.existsSync(cli)) { console.error("dist/cli.js is missing; run npm run build"); process.exit(2); }
const all = fs.readdirSync(path.join(root, "examples"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const wanted = process.argv.slice(2);
for (const a of wanted) if (!all.includes(a)) { console.error(`Unknown example "${a}"; examples: ${all.join(", ")}`); process.exit(2); }

let failed = false;
for (const app of wanted.length ? wanted : all) {
  const dir = path.join(root, "examples", app);
  if (fs.existsSync(path.join(dir, "package-lock.json")) && !fs.existsSync(path.join(dir, "node_modules"))) {
    if (spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: dir, stdio: "inherit" }).status !== 0) { console.error(`${app}: npm ci failed`); process.exit(2); }
  }
  const t0 = Date.now();
  const r = spawnSync("node", [cli, "build", "-C", dir, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let res;
  try { res = JSON.parse(r.stdout); } catch { console.error(`${app}: build crashed\n${r.stderr}`); process.exit(2); }
  if (res.error) { console.error(`${app}: ${res.error.message}`); process.exit(2); }
  const findings = [...(res.errors ?? []), ...(res.warnings ?? [])];
  console.log(`${app}: ${(res.errors ?? []).length} error(s), ${(res.warnings ?? []).length} warning(s), ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const f of findings) console.log(`  ${f.severity} ${f.rule} ${[f.locale, f.target, f.page].filter(Boolean).join("/")}: ${f.message}`);
  if (findings.length) failed = true;
}
process.exit(failed ? 1 : 0);
