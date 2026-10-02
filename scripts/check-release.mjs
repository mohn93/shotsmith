// Checks that the repository is ready to release its package.json version.
//   node scripts/check-release.mjs          versions and changelog only (dry run)
//   node scripts/check-release.mjs v1.2.3   also: tag matches, commit is on origin/main, version not yet on npm
// Writes that version's changelog section to release/notes.md for the GitHub release.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Reads a JSON object file; a missing, malformed or non-object one is recorded as a problem and gives null.
function readJson(root, file, problems) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("not a JSON object");
    return data;
  } catch {
    problems.push(`${file} is missing or not valid JSON`);
    return null;
  }
}

// Turns an `npm view` result into checkRelease options: only E404 / "No match found" means not published.
export function npmStatus(view, version) {
  if (view.status === 0) return { published: view.stdout.trim() === version };
  const err = `${view.stderr ?? ""}`;
  if (/E404|No match found/.test(err)) return { published: false };
  const first = err.split("\n").find((l) => l.trim()) ?? view.error?.message ?? `npm view exited with ${view.status}`;
  return { published: false, npmError: first.trim() };
}

const TAG_FORMAT = /^v\d+\.\d+\.\d+$/;

function changelogSection(text, version) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

export function checkRelease(root, o = {}) {
  const problems = [];
  const pkg = readJson(root, "package.json", problems);
  const version = pkg?.version;
  if (pkg && typeof version !== "string") problems.push("package.json has no version");
  if (typeof version === "string") {
    const plugin = readJson(root, ".claude-plugin/plugin.json", problems);
    if (plugin && plugin.version !== version) problems.push(`.claude-plugin/plugin.json version ${plugin.version} does not match package.json version ${version}`);
    const market = readJson(root, ".claude-plugin/marketplace.json", problems);
    if (market && market.plugins?.[0]?.version !== version) problems.push(`.claude-plugin/marketplace.json version ${market.plugins?.[0]?.version} does not match package.json version ${version}`);
  }
  let notes = null;
  if (typeof version === "string") {
    let text = null;
    try {
      text = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    } catch {
      problems.push("CHANGELOG.md is missing or unreadable");
    }
    if (text !== null) {
      notes = changelogSection(text, version);
      if (!notes) problems.push(`CHANGELOG.md has no "## ${version}" section with notes`);
    }
  }
  if (o.tag !== undefined) {
    if (!TAG_FORMAT.test(o.tag)) problems.push(`tag must look like v1.2.3, got "${o.tag}"`);
    else {
      if (typeof version === "string" && o.tag !== `v${version}`) problems.push(`tag ${o.tag} does not match package.json version ${version}`);
      if (!o.onMain) problems.push("the tagged commit is not on main; tag a commit on main");
      if (o.npmError) problems.push(`could not check npm for ${version}: ${o.npmError}`);
      else if (o.published) problems.push(`${version} is already on npm; bump the version`);
    }
  }
  if (problems.length) throw new Error(`Not ready to release:\n- ${problems.join("\n- ")}`);
  return { version, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tag = process.argv[2] || undefined;
  const o = {};
  if (tag) {
    o.tag = tag;
    // A malformed tag fails on its own; skip the git and npm lookups for it.
    if (TAG_FORMAT.test(tag)) {
      const version = readJson(root, "package.json", [])?.version;
      o.onMain = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { cwd: root }).status === 0;
      if (typeof version === "string") {
        const view = spawnSync("npm", ["view", `shotsmith@${version}`, "version"], { cwd: root, encoding: "utf8" });
        Object.assign(o, npmStatus(view, version));
      }
    }
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
