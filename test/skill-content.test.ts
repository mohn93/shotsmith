import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, tempDir } from "./helpers.js";

const SKILL = path.join(ROOT, "skills/store-screenshots");
const read = (f: string) => fs.readFileSync(path.join(SKILL, f), "utf8");
const DOCS = ["SKILL.md", "styles.md", "targets.md", "reference/README.md"];
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

describe("skill content", () => {
  it("has frontmatter with its name and a description", () => {
    const m = read("SKILL.md").match(/^---\nname: (.+)\ndescription: (.+)\n---\n/);
    expect(m?.[1]).toBe("store-screenshots");
    expect(m?.[2].length).toBeGreaterThan(80);
  });

  it("pins this package's version wherever it names shotsmith@", () => {
    const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const pins = DOCS.map(read).join("\n").match(/shotsmith@[\w.-]+/g) ?? [];
    expect(pins.length).toBeGreaterThan(0);
    expect([...new Set(pins)]).toEqual([`shotsmith@${version}`]);
  });

  it("refers only to files it ships", () => {
    const text = DOCS.map(read).join("\n");
    const refs = new Set([...text.matchAll(/`((?:previews|reference)\/[^`*<>\s]+)`/g)].map((m) => m[1]));
    for (const f of ["styles.md", "targets.md", "kit.md", "reference/README.md"]) refs.add(f);
    for (const r of refs) expect(fs.existsSync(path.join(SKILL, r)), r).toBe(true);
  });

  it("no longer describes the old scripts", () => {
    const text = DOCS.map(read).join("\n");
    for (const s of ["render.mjs", "build.mjs", "check.mjs", "thumbs.mjs", "strip.mjs", "screens.config.json", "StoreShot"]) expect(text, s).not.toContain(s);
  });

  it("ships no font files", () => {
    expect(walk(SKILL).filter((f) => /\.(otf|ttf|ttc|woff2?)$/i.test(f))).toEqual([]);
  });

  it("holds kit.md and the example sources in sync with their sources", () => {
    const r = spawnSync("node", ["scripts/sync-skill.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
    expect(r.stdout, "the skill copies are out of date: run npm run sync-skill").toBe("");
    expect(r.status, "the skill copies are out of date: run npm run sync-skill").toBe(0);
  });

  it("ships no example package.json (those run the repo's CLI)", () => {
    expect(walk(path.join(SKILL, "reference/examples")).filter((f) => path.basename(f) === "package.json")).toEqual([]);
  });

  it("removes empty folders left by a removed example and reports them in --check", () => {
    const dir = tempDir("sync-");
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.copyFileSync(path.join(ROOT, "scripts/sync-skill.mjs"), path.join(dir, "scripts/sync-skill.mjs"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(path.join(dir, "docs/kit.md"), "kit");
    fs.mkdirSync(path.join(dir, "examples/app/pages"), { recursive: true });
    fs.writeFileSync(path.join(dir, "examples/app/pages/01.html"), "page");
    const sync = (...a: string[]) => spawnSync("node", ["scripts/sync-skill.mjs", ...a], { cwd: dir, encoding: "utf8" });
    expect(sync().status).toBe(0);
    expect(sync("--check").stdout).toBe("");

    const gone = path.join(dir, "skills/store-screenshots/reference/examples/gone/pages");
    fs.mkdirSync(gone, { recursive: true });
    const check = sync("--check");
    expect(check.stdout.trim()).toBe("skills/store-screenshots/reference/examples/gone/pages/");
    expect(check.status).toBe(1);

    fs.writeFileSync(path.join(gone, "02.html"), "stale");
    expect(sync().status).toBe(0);
    expect(fs.existsSync(path.join(dir, "skills/store-screenshots/reference/examples/gone"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "skills/store-screenshots/reference/examples/app/pages/01.html"))).toBe(true);
    expect(sync("--check").stdout).toBe("");
  });

  it("describes the upload commands, their confirmations and credentials", () => {
    const skill = read("SKILL.md"), targets = read("targets.md");
    for (const s of ["upload apple", "upload play", "--apply", "--commit"]) expect(skill, s).toContain(s);
    expect(skill).toMatch(/[Nn]ever submit/);
    expect(skill).not.toContain("lists an `upload` command");
    for (const s of ["SHOTSMITH_ASC_ISSUER_ID", "SHOTSMITH_ASC_KEY_ID", "SHOTSMITH_ASC_KEY_PATH", "SHOTSMITH_PLAY_KEY_PATH", "credentials.json", "--app-version", "--changes-not-sent-for-review", "upload-plan-", "upload-report-apple.json", "upload-report-play.json"]) {
      expect(targets, s).toContain(s);
    }
    expect(targets).not.toMatch(/upload apple[^\n]*--version/);
    expect(skill).toMatch(/not confirmation of the plan/);
    expect(skill).toMatch(/never ask for keys in chat/);
    expect(targets).toContain('"apple": { "bundleId" }');
    expect(targets).toContain('"play": { "packageName" }');
  });

  it("tells an agent without a shell what to hand over instead of renders", () => {
    const skill = read("SKILL.md");
    expect(skill).toMatch(/^## Without a shell or Node/m);
    expect(skill).toMatch(/do not describe renders you have not seen/i);
  });
});
