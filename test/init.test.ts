import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.js";

describe("init", () => {
  it("scaffolds a workspace that builds cleanly", () => {
    const dir = path.join(ROOT, "test/.tmp", `init-${process.pid}`);
    fs.rmSync(dir, { recursive: true, force: true });
    execFileSync("node", [`${ROOT}/dist/cli.js`, "init", dir, "--app", "Savory", "--no-install"], { encoding: "utf8" });
    expect(JSON.parse(fs.readFileSync(`${dir}/shotsmith.config.json`, "utf8")).app).toBe("Savory");
    expect(fs.existsSync(`${dir}/.gitignore`)).toBe(true);
    expect(fs.readFileSync(`${dir}/package.json`, "utf8")).toMatch(/"shotsmith": "\^\d+\.\d+\.\d+"/);
    expect(fs.existsSync(`${dir}/inputs/iphone/en/home.png`)).toBe(true);
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
    const out = execFileSync("node", [`${ROOT}/dist/cli.js`, "build", "-C", dir, "--json"], { encoding: "utf8", env: { ...process.env, FONT_DIRS: "/nonexistent" } });
    const res = JSON.parse(out);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w: any) => w.rule === "font.fallback")).toBe(true);
    expect(() => execFileSync("node", [`${ROOT}/dist/cli.js`, "init", dir, "--no-install"], { stdio: "pipe" })).toThrow();
  });
});
