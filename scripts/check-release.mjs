// Checks that the repository is ready to release its package.json version.
//   node scripts/check-release.mjs          versions and changelog only (dry run)
//   node scripts/check-release.mjs v1.2.3   also: tag matches, commit is on origin/main, version not yet on npm
// Writes that version's changelog section to release/notes.md for the GitHub release.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const json = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

function changelogSection(text, version) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

export function checkRelease(root, o = {}) {
  const problems = [];
  const { version } = json(root, "package.json");
  const plugin = json(root, ".claude-plugin/plugin.json").version;
  if (plugin !== version) problems.push(`.claude-plugin/plugin.json version ${plugin} does not match package.json version ${version}`);
  const market = json(root, ".claude-plugin/marketplace.json").plugins?.[0]?.version;
  if (market !== version) problems.push(`.claude-plugin/marketplace.json version ${market} does not match package.json version ${version}`);
  const notes = changelogSection(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), version);
  if (!notes) problems.push(`CHANGELOG.md has no "## ${version}" section with notes`);
  if (o.tag !== undefined) {
    if (!/^v\d+\.\d+\.\d+$/.test(o.tag)) problems.push(`tag must look like v1.2.3, got "${o.tag}"`);
    else if (o.tag !== `v${version}`) problems.push(`tag ${o.tag} does not match package.json version ${version}`);
    if (!o.onMain) problems.push("the tagged commit is not on main; tag a commit on main");
    if (o.published) problems.push(`${version} is already on npm; bump the version`);
  }
  if (problems.length) throw new Error(`Not ready to release:\n- ${problems.join("\n- ")}`);
  return { version, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tag = process.argv[2] || undefined;
  const o = {};
  if (tag) {
    const { version } = json(root, "package.json");
    o.tag = tag;
    o.onMain = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { cwd: root }).status === 0;
    const view = spawnSync("npm", ["view", `shotsmith@${version}`, "version"], { cwd: root, encoding: "utf8" });
    o.published = view.status === 0 && view.stdout.trim() === version;
  }
  try {
    const { version, notes } = checkRelease(root, o);
    fs.mkdirSync(path.join(root, "release"), { recursive: true });
    fs.writeFileSync(path.join(root, "release/notes.md"), `${notes}\n`);
    console.log(`Ready to release ${version}${tag ? ` as ${tag}` : " (dry run)"}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
