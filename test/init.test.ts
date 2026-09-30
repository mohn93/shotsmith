import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { loadConfig } from "../src/config/schema.js";
import { checkInputs } from "../src/checks/inputs.js";
import { init } from "../src/init/init.js";
import { ROOT, tempDir } from "./helpers.js";

const snapshot = (dir: string): string[] => fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).map((e) => path.relative(dir, path.join(e.parentPath, e.name))).sort()
  : ["<missing>"];

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
    // The untouched placeholder capture is an error, so build exits 1; its JSON still goes to stdout.
    const built = spawnSync("node", [`${ROOT}/dist/cli.js`, "build", "-C", dir, "--json"], { encoding: "utf8", env: { ...process.env, FONT_DIRS: "/nonexistent" } });
    expect(built.status).toBe(1);
    const res = JSON.parse(built.stdout);
    expect(res.errors.map((e: any) => e.rule)).toEqual(["capture.placeholder"]);
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

  it("refuses a dangling symlink destination and writes nothing through it", async () => {
    const dir = tempDir("init-dangle-");
    const outside = path.join(tempDir("init-outside-"), "target.html");
    fs.mkdirSync(`${dir}/pages`);
    fs.symlinkSync(outside, `${dir}/pages/01-opener.html`);
    await expect(init(dir, { install: false })).rejects.toThrow(/Refusing to overwrite existing files.*01-opener\.html/);
    expect(fs.existsSync(outside)).toBe(false);
    expect(snapshot(dir)).toEqual(["pages", "pages/01-opener.html"]);
  });

  it("flags the placeholder capture until it is replaced", async () => {
    const dir = tempDir("init-placeholder-");
    await init(dir, { install: false });
    const capture = `${dir}/inputs/iphone/en/home.png`;
    const found = checkInputs(loadConfig(dir)).filter((f) => f.rule === "capture.placeholder");
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe("error");
    expect(found[0].message).toContain("inputs/iphone/en/home.png");
    expect(found[0].message).toMatch(/[Rr]eplace/);
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).png().toFile(capture);
    expect(checkInputs(loadConfig(dir))).toEqual([]);
  });

  it("leaves the directory as it was when creating the placeholder fails", async () => {
    const fresh = path.join(tempDir("init-fail-"), "new");
    await expect(init(fresh, { install: false, writePlaceholder: async () => { throw new Error("sharp broke"); } })).rejects.toThrow(/sharp broke/);
    expect(fs.existsSync(fresh)).toBe(false);

    const existing = tempDir("init-fail-existing-");
    fs.writeFileSync(`${existing}/notes.txt`, "keep");
    fs.mkdirSync(`${existing}/inputs`);
    const before = snapshot(existing);
    await expect(init(existing, { install: false, writePlaceholder: async () => { throw new Error("sharp broke"); } })).rejects.toThrow(/sharp broke/);
    expect(snapshot(existing)).toEqual(before);
    expect(fs.readFileSync(`${existing}/notes.txt`, "utf8")).toBe("keep");
  });
});
