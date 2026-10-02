import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without types
import { packSkill } from "../scripts/pack-skill.mjs";
import { ROOT } from "./helpers.js";

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
