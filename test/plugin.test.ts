import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.js";

const json = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

describe("Claude Code plugin", () => {
  it("matches the package and points at the skill", () => {
    const pkg = json("package.json"), plugin = json(".claude-plugin/plugin.json"), market = json(".claude-plugin/marketplace.json");
    expect(plugin).toMatchObject({ name: "shotsmith", version: pkg.version, license: "MIT", skills: "./skills/" });
    expect(fs.existsSync(path.join(ROOT, plugin.skills, "store-screenshots/SKILL.md"))).toBe(true);
    expect(market.name).toBe("shotsmith");
    expect(market.plugins).toEqual([expect.objectContaining({ name: "shotsmith", source: "./", version: pkg.version })]);
  });
});
