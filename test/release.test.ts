import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without types
import { packSkill } from "../scripts/pack-skill.mjs";
// @ts-expect-error -- plain .mjs script without types
import { checkRelease } from "../scripts/check-release.mjs";
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

  it("passes on this repository", () => {
    expect(checkRelease(ROOT).version).toBe(version);
  });
});
