import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, tempDir } from "./helpers.js";

const CLI = path.join(ROOT, "dist/cli.js");
const SKILL = path.join(ROOT, "skills/store-screenshots");
const run = (args: string[], env: NodeJS.ProcessEnv = process.env) => spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8", env });

describe("skill command", () => {
  it("prints the bundled skill folder", () => {
    expect(run(["skill", "path"]).stdout.trim()).toBe(SKILL);
    expect(JSON.parse(run(["skill", "path", "--json"]).stdout)).toEqual({ ok: true, path: SKILL });
  });

  it("installs, refuses to overwrite, and replaces with --force", () => {
    const home = tempDir("skills-");
    const dest = path.join(home, "store-screenshots");
    expect(JSON.parse(run(["skill", "install", "--dir", home, "--json"]).stdout)).toEqual({ ok: true, path: dest, replaced: false });
    expect(fs.readFileSync(path.join(dest, "SKILL.md"), "utf8")).toBe(fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8"));
    expect(fs.existsSync(path.join(dest, "reference/README.md"))).toBe(true);

    fs.writeFileSync(path.join(dest, "stale.txt"), "x");
    const again = run(["skill", "install", "--dir", home, "--json"]);
    expect(again.status).toBe(2);
    expect(JSON.parse(again.stdout).error.message).toMatch(/already exists; pass --force to replace it/);

    expect(JSON.parse(run(["skill", "install", "--dir", home, "--force", "--json"]).stdout).replaced).toBe(true);
    expect(fs.existsSync(path.join(dest, "stale.txt"))).toBe(false);
    expect(fs.readdirSync(home)).toEqual(["store-screenshots"]);
  });

  it("never replaces a folder that is not a skill, or a link", () => {
    const home = tempDir("skills-");
    fs.mkdirSync(path.join(home, "store-screenshots"));
    fs.writeFileSync(path.join(home, "store-screenshots/notes.txt"), "mine");
    const r = run(["skill", "install", "--dir", home, "--force"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/is not a skill folder/);
    expect(fs.readFileSync(path.join(home, "store-screenshots/notes.txt"), "utf8")).toBe("mine");

    const linked = tempDir("skills-");
    fs.symlinkSync(home, path.join(linked, "store-screenshots"), "dir");
    const l = run(["skill", "install", "--dir", linked, "--force"]);
    expect(l.status).toBe(2);
    expect(l.stderr).toMatch(/is a link/);
  });

  it("installs into ~/.claude/skills by default", () => {
    const home = tempDir("home-");
    const r = run(["skill", "install", "--json"], { ...process.env, HOME: home });
    expect(JSON.parse(r.stdout).path).toBe(path.join(home, ".claude/skills/store-screenshots"));
  });

  it("ships the skill in the npm package", () => {
    const r = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, encoding: "utf8" });
    const files = JSON.parse(r.stdout)[0].files.map((f: { path: string }) => f.path);
    expect(files).toContain("skills/store-screenshots/SKILL.md");
    expect(files).toContain("skills/store-screenshots/kit.md");
  });
});
