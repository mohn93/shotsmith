import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without types
import { packSkill } from "../scripts/pack-skill.mjs";
// @ts-expect-error -- plain .mjs script without types
import { checkRelease, npmStatus } from "../scripts/check-release.mjs";
import { ROOT, tempDir } from "./helpers.js";

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

describe("pack-skill", () => {
  it("zips the skill folder for claude.ai with SKILL.md inside one top-level folder", () => {
    const zip: string = packSkill(ROOT);
    expect(zip).toBe(path.join(ROOT, "release", `store-screenshots-${version}.zip`));
    const entries = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).trim().split("\n");
    expect(entries).toEqual(expect.arrayContaining(["store-screenshots/SKILL.md", "store-screenshots/targets.md", "store-screenshots/styles.md", "store-screenshots/kit.md"]));
    expect(entries.filter((e) => !e.startsWith("store-screenshots/"))).toEqual([]);
    expect(entries.filter((e) => /\.DS_Store$|\.(otf|ttf|ttc|woff2?)$|(^|\/)package\.json$/i.test(e))).toEqual([]);
    expect(fs.statSync(zip).size).toBeLessThan(8 * 1024 * 1024);
    const skill = execFileSync("unzip", ["-p", zip, "store-screenshots/SKILL.md"], { encoding: "utf8" });
    expect(skill).toBe(fs.readFileSync(path.join(ROOT, "skills/store-screenshots/SKILL.md"), "utf8"));
  });

  it("replaces an older zip of the same version", () => {
    const first = packSkill(ROOT);
    fs.appendFileSync(first, "junk");
    const second = packSkill(ROOT);
    expect(() => execFileSync("unzip", ["-tq", second])).not.toThrow();
  });
});

function releaseRoot(o: { version?: string; plugin?: string; market?: string; changelog?: string } = {}): string {
  const root = tempDir("release-");
  const v = o.version ?? "1.2.3";
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "shotsmith", version: v }));
  fs.mkdirSync(path.join(root, ".claude-plugin"));
  fs.writeFileSync(path.join(root, ".claude-plugin/plugin.json"), JSON.stringify({ name: "shotsmith", version: o.plugin ?? v }));
  fs.writeFileSync(path.join(root, ".claude-plugin/marketplace.json"), JSON.stringify({ plugins: [{ name: "shotsmith", version: o.market ?? v }] }));
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), o.changelog ?? `# Changelog\n\n## ${v}\n\n- First.\n- Second.\n\n## 0.0.1\n\n- Old.\n`);
  return root;
}

describe("check-release", () => {
  it("returns the version and that version's changelog notes", () => {
    expect(checkRelease(releaseRoot())).toEqual({ version: "1.2.3", notes: "- First.\n- Second." });
  });

  it("checks the tag, main and npm only when tagging", () => {
    expect(checkRelease(releaseRoot(), { tag: "v1.2.3", onMain: true, published: false }).version).toBe("1.2.3");
    expect(() => checkRelease(releaseRoot(), { tag: "v1.2.4", onMain: true, published: false })).toThrow(/tag v1\.2\.4 does not match package\.json version 1\.2\.3/);
    expect(() => checkRelease(releaseRoot(), { tag: "1.2.3", onMain: true, published: false })).toThrow(/tag must look like v1\.2\.3/);
    expect(() => checkRelease(releaseRoot(), { tag: "v1.2.3", onMain: false, published: false })).toThrow(/not on main/);
    expect(() => checkRelease(releaseRoot(), { tag: "v1.2.3", onMain: true, published: true })).toThrow(/1\.2\.3 is already on npm/);
  });

  it("lists every mismatch at once", () => {
    const fail = () => checkRelease(releaseRoot({ plugin: "1.0.0", market: "1.1.0", changelog: "# Changelog\n" }));
    expect(fail).toThrow(/plugin\.json version 1\.0\.0/);
    expect(fail).toThrow(/marketplace\.json version 1\.1\.0/);
    expect(fail).toThrow(/CHANGELOG\.md has no "## 1\.2\.3" section/);
  });

  it("lists a missing or malformed manifest as a problem", () => {
    const missing = releaseRoot();
    fs.rmSync(path.join(missing, ".claude-plugin/plugin.json"));
    expect(() => checkRelease(missing)).toThrow(/Not ready to release:\n- \.claude-plugin\/plugin\.json is missing or not valid JSON/);
    const malformed = releaseRoot();
    fs.writeFileSync(path.join(malformed, ".claude-plugin/marketplace.json"), "{ not json");
    const fail = () => checkRelease(malformed);
    expect(fail).toThrow(/marketplace\.json is missing or not valid JSON/);
    expect(fail).not.toThrow(SyntaxError);
    const noPackage = releaseRoot();
    fs.rmSync(path.join(noPackage, "package.json"));
    expect(() => checkRelease(noPackage)).toThrow(/package\.json is missing or not valid JSON/);
    const noChangelog = releaseRoot();
    fs.rmSync(path.join(noChangelog, "CHANGELOG.md"));
    expect(() => checkRelease(noChangelog)).toThrow(/CHANGELOG\.md is missing or unreadable/);
  });

  it("reports an npm lookup failure instead of treating it as not published", () => {
    const o = { tag: "v1.2.3", onMain: true };
    expect(() => checkRelease(releaseRoot(), { ...o, npmError: "getaddrinfo ENOTFOUND registry.npmjs.org" })).toThrow(/could not check npm for 1\.2\.3: getaddrinfo ENOTFOUND/);
  });

  it("passes on this repository", () => {
    expect(checkRelease(ROOT).version).toBe(version);
  });
});

describe("check-release npmStatus", () => {
  it("treats only E404 and no match as not published", () => {
    expect(npmStatus({ status: 0, stdout: "1.2.3\n", stderr: "" }, "1.2.3")).toEqual({ published: true });
    expect(npmStatus({ status: 1, stdout: "", stderr: "npm error code E404\nnpm error 404 Not Found" }, "1.2.3")).toEqual({ published: false });
    expect(npmStatus({ status: 1, stdout: "", stderr: "npm error No match found for version 1.2.3" }, "1.2.3")).toEqual({ published: false });
  });

  it("reports any other failure with the first line of stderr", () => {
    expect(npmStatus({ status: 1, stdout: "", stderr: "\nnpm error code ENOTFOUND\nnpm error network" }, "1.2.3")).toEqual({ published: false, npmError: "npm error code ENOTFOUND" });
    expect(npmStatus({ status: null, stdout: "", stderr: "", error: new Error("spawn npm ENOENT") }, "1.2.3").npmError).toBe("spawn npm ENOENT");
  });
});

describe("check-release CLI", () => {
  // A temp repo with its own copy of the script, which resolves the repo root from its own location.
  function cliRoot(): string {
    const root = releaseRoot();
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(path.join(ROOT, "scripts/check-release.mjs"), path.join(root, "scripts/check-release.mjs"));
    return root;
  }
  const run = (root: string, ...args: string[]) => spawnSync(process.execPath, [path.join(root, "scripts/check-release.mjs"), ...args], { cwd: root, encoding: "utf8" });

  it("passes without a tag and writes the release notes", () => {
    const root = cliRoot();
    const r = run(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Ready to release 1.2.3 (dry run)");
    expect(fs.readFileSync(path.join(root, "release/notes.md"), "utf8")).toBe("- First.\n- Second.\n");
  });

  it("fails on a malformed tag without looking at git or npm", () => {
    const root = cliRoot();
    const r = run(root, "1.2.3");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/tag must look like v1\.2\.3/);
    expect(r.stderr).not.toMatch(/not on main|npm/);
    expect(fs.existsSync(path.join(root, "release"))).toBe(false);
  });
});
