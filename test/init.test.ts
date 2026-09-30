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
    expect(() => execFileSync("node", [`${ROOT}/dist/cli.js`, "init", dir, "--no-install"], { stdio: "pipe", encoding: "utf8" })).toThrow(/already has a shotsmith\.config\.json/);
  });

  it("refuses to overwrite existing files and leaves them unchanged", () => {
    const dir = path.join(ROOT, "test/.tmp", `init-keep-${process.pid}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/package.json`, '{"name":"mine"}');
    let err = "";
    try { execFileSync("node", [`${ROOT}/dist/cli.js`, "init", dir, "--no-install"], { stdio: "pipe", encoding: "utf8" }); }
    catch (e: any) { err = String(e.stderr); }
    expect(err).toMatch(/Refusing to overwrite existing files.*package\.json/);
    expect(fs.readFileSync(`${dir}/package.json`, "utf8")).toBe('{"name":"mine"}');
    expect(fs.existsSync(`${dir}/shotsmith.config.json`)).toBe(false);
  });

  it("keeps awkward app names intact and valid JSON", () => {
    const dir = path.join(ROOT, "test/.tmp", `init-name-${process.pid}`);
    fs.rmSync(dir, { recursive: true, force: true });
    const app = `Joe's "Best" $&`;
    execFileSync("node", [`${ROOT}/dist/cli.js`, "init", dir, "--app", app, "--no-install"], { encoding: "utf8" });
    expect(JSON.parse(fs.readFileSync(`${dir}/shotsmith.config.json`, "utf8")).app).toBe(app);
    expect(JSON.parse(fs.readFileSync(`${dir}/claims.json`, "utf8"))["opener.headline"].text.en).toBe(`${app}, made for you.`);
    expect(fs.readFileSync(`${dir}/brief.md`, "utf8")).toContain(`# Direction brief: ${app}`);
  });
});
