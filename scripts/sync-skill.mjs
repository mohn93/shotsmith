// Copies what the skill ships from its sources, so the two cannot drift:
//   docs/kit.md                       -> skills/store-screenshots/kit.md
//   examples/<app>/<workspace files>  -> skills/store-screenshots/reference/examples/<app>/
//   node scripts/sync-skill.mjs           write the copies and remove copies whose source is gone
//   node scripts/sync-skill.mjs --check   list copies that differ or should not exist; exit 1 if any
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = path.join(root, "skills/store-screenshots");
const copiesDir = path.join(skill, "reference/examples");
const EXAMPLE_FILES = ["README.md", "brief.md", "store-copy.md", "shotsmith.config.json", "claims.json", "package.json", "pages"];

// Files under p (p itself when it is a file), skipping dot files such as .DS_Store.
const files = (p) => fs.statSync(p).isDirectory()
  ? fs.readdirSync(p).filter((n) => !n.startsWith(".")).sort().flatMap((n) => files(path.join(p, n)))
  : [p];

function pairs() {
  const out = [[path.join(root, "docs/kit.md"), path.join(skill, "kit.md")]];
  const ex = path.join(root, "examples");
  const apps = fs.existsSync(ex) ? fs.readdirSync(ex, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
  for (const app of apps) for (const name of EXAMPLE_FILES) {
    const src = path.join(ex, app, name);
    if (!fs.existsSync(src)) continue;
    for (const f of files(src)) out.push([f, path.join(copiesDir, app, path.relative(path.join(ex, app), f))]);
  }
  return out;
}

const want = pairs();
const wanted = new Set(want.map(([, d]) => d));
const extra = fs.existsSync(copiesDir) ? files(copiesDir).filter((f) => !wanted.has(f)) : [];
const differ = want.filter(([s, d]) => !fs.existsSync(d) || !fs.readFileSync(s).equals(fs.readFileSync(d))).map(([, d]) => d);

if (process.argv.includes("--check")) {
  for (const f of [...differ, ...extra]) console.log(path.relative(root, f));
  process.exit(differ.length || extra.length ? 1 : 0);
}
for (const f of extra) fs.rmSync(f);
for (const [s, d] of want) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
console.log(`synced ${want.length} file(s), removed ${extra.length}`);
