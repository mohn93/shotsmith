import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.js";

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

describe("npm package", () => {
  it("has the metadata npm and provenance need", () => {
    expect(pkg).toMatchObject({
      name: "shotsmith",
      license: "MIT",
      homepage: "https://github.com/mohn93/shotsmith#readme",
      bugs: { url: "https://github.com/mohn93/shotsmith/issues" },
      repository: { type: "git", url: "git+https://github.com/mohn93/shotsmith.git" },
      publishConfig: { access: "public", provenance: true },
      engines: { node: ">=20" },
    });
    expect(pkg.keywords).toEqual(expect.arrayContaining(["app-store", "google-play", "screenshots"]));
    expect(pkg.scripts["pack-skill"]).toBe("node scripts/pack-skill.mjs");
  });

  it("ships the CLI, the kit, the templates and the skill, and nothing from the repo's working folders", () => {
    const r = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const [info] = JSON.parse(r.stdout);
    const files: string[] = info.files.map((f: { path: string }) => f.path);
    for (const f of ["package.json", "README.md", "LICENSE", "dist/cli.js", "dist/kit/index.js", "dist/kit/index.d.ts", "dist/kit/three.js",
      "templates/init/shotsmith.config.json", "skills/store-screenshots/SKILL.md", "skills/store-screenshots/kit.md"]) {
      expect(files, f).toContain(f);
    }
    expect(files.filter((f) => /^(src|test|examples|docs|scripts|release|\.superpowers|\.claude-plugin|\.github)\//.test(f))).toEqual([]);
    expect(info.size).toBeLessThan(5 * 1024 * 1024);
  });
});
