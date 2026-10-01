import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.js";

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
    expect(r.stdout).toBe("");
    expect(r.status).toBe(0);
  });
});
