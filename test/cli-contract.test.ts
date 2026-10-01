import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/schema.js";
import { outPath } from "../src/render/render.js";
import { ROOT, tempDir, tmpWorkspace } from "./helpers.js";

const run = (args: string[], cwd = ROOT, env: NodeJS.ProcessEnv = process.env) => {
  const r = spawnSync("node", [`${ROOT}/dist/cli.js`, ...args], { encoding: "utf8", cwd, env });
  return { code: r.status as number, out: r.stdout, err: r.stderr };
};

function stripWorkspace(): string {
  const ws = tempDir("contract-strip-");
  fs.writeFileSync(path.join(ws, "shotsmith.config.json"), JSON.stringify({ app: "A", pages: ["a", "b"], targets: ["android-phone"], locales: [{ code: "en" }] }));
  return ws;
}

async function renderedStrip(second: number): Promise<string> {
  const ws = stripWorkspace();
  const cfg = loadConfig(ws);
  for (const [p, v] of [["a", 20], ["b", second]] as const) {
    const f = outPath(cfg, "en", "android-phone", p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    await sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: v, g: v, b: v } } }).png().toFile(f);
  }
  return ws;
}

describe("cli contract", () => {
  it("prints a runtime failure as JSON on stdout under --json, with exit 2 and an empty stderr", () => {
    const ws = tmpWorkspace("basic");
    const r = run(["build", "-t", "nope", "--json", "-C", ws]);
    expect(r.code).toBe(2);
    expect(r.err).toBe("");
    expect(r.out.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(r.out)).toMatchObject({ ok: false, error: { message: expect.stringMatching(/nope/) } });
  });

  it("prints a runtime failure to stderr without --json", () => {
    const ws = tmpWorkspace("basic");
    const r = run(["build", "-t", "nope", "-C", ws]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toMatch(/nope/);
  });

  it("fails check with JSON when there is no config", () => {
    const r = run(["check", "--json", "-C", tempDir("contract-empty-")]);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.out)).toMatchObject({ ok: false, error: { message: expect.any(String) } });
  });

  it("follows the contract for commander usage errors", () => {
    const json = run(["build", "--bogus", "--json"]);
    expect(json.code).toBe(2);
    expect(json.err).toBe("");
    expect(JSON.parse(json.out)).toMatchObject({ ok: false, error: { message: expect.stringMatching(/--bogus/) } });
    const plain = run(["nocommand"]);
    expect(plain.code).toBe(2);
    expect(plain.out).toBe("");
    expect(plain.err).toMatch(/nocommand/);
    expect(run(["--help"]).code).toBe(0);
    expect(run(["--version"]).code).toBe(0);
  });

  it("prints --version and --help as one JSON object under --json, with exit 0", () => {
    const version = JSON.parse(fs.readFileSync(`${ROOT}/package.json`, "utf8")).version;
    const v = run(["--version", "--json"]);
    expect(v.code).toBe(0);
    expect(v.out.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(v.out)).toEqual({ ok: true, version });
    for (const args of [["--help", "--json"], ["build", "--help", "--json"], ["render", "--json", "--help"]]) {
      const r = run(args);
      expect(r.code, args.join(" ")).toBe(0);
      expect(r.out.trim().split("\n"), args.join(" ")).toHaveLength(1);
      expect(JSON.parse(r.out), args.join(" ")).toEqual({ ok: true, help: expect.stringMatching(/^Usage: shotsmith/) });
    }
    expect(JSON.parse(run(["build", "--help", "--json"]).out).help).toMatch(/Usage: shotsmith build/);
    // Without --json the text is printed as usual.
    expect(run(["--version"]).out.trim()).toBe(version);
    expect(run(["build", "--help"]).out).toMatch(/^Usage: shotsmith build/);
  });

  it("rejects bad thumbs and strip arguments with exit 2 and writes nothing", () => {
    const ws = tmpWorkspace("basic");
    const t = "android-phone";
    const cases = [
      ["thumbs", "bogus"],
      ["thumbs", t, "--width", "abc"],
      ["thumbs", t, "--width", "49"],
      ["thumbs", t, "--width", "2001"],
      ["thumbs", t, "--from", "bogus"],
      ["thumbs", t, "-l", "../../x"],
      ["strip", "bogus"],
      ["strip", t, "-l", "../../x"],
    ];
    for (const args of cases) {
      const r = run([...args, "--json", "-C", ws]);
      expect(r.code, args.join(" ")).toBe(2);
      expect(JSON.parse(r.out), args.join(" ")).toMatchObject({ ok: false, error: { message: expect.any(String) } });
    }
    expect(JSON.parse(run(["thumbs", "bogus", "--json", "-C", ws]).out).error.message).toMatch(/bogus.*iphone-6\.9, android-phone/);
    expect(fs.existsSync(`${ws}/review`)).toBe(false);
    expect(fs.existsSync(path.join(ws, "../x"))).toBe(false);
  });

  it("rejects bad render options before starting Chromium", () => {
    const ws = tmpWorkspace("basic");
    // With no browsers installed, any launch fails loudly with its own message, so an option error proves no launch.
    const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: tempDir("contract-no-browsers-") };
    expect(JSON.parse(run(["render", "plain", "--json", "-C", ws], ROOT, env).out).error.message).toMatch(/Chromium for Playwright is not installed/);
    for (const args of [["--fps", "abc"], ["--fps", "0"], ["--fps", "121"], ["--duration", "0"], ["--duration", "61"], ["--duration", "x"]]) {
      const r = run(["render", "plain", ...args, "--json", "-C", ws], ROOT, env);
      expect(r.code, args.join(" ")).toBe(2);
      expect(JSON.parse(r.out).error.message).toMatch(new RegExp(args[0]));
    }
    expect(fs.existsSync(`${ws}/out`)).toBe(false);
  });

  it("resolves init's directory against -C", () => {
    const base = tempDir("contract-init-");
    const r = run(["init", "rel", "-C", base, "--no-install", "--json"]);
    expect(r.code).toBe(0);
    expect(fs.existsSync(`${base}/rel/shotsmith.config.json`)).toBe(true);
    const res = JSON.parse(r.out);
    expect(res).toMatchObject({ ok: true, dir: `${base}/rel` });
    expect(res.files).toContain("shotsmith.config.json");
  });

  it("resolves render -o against -C and prints one JSON shape", () => {
    const ws = tmpWorkspace("basic");
    const r = run(["render", "plain", "-C", ws, "-o", "rel.png", "--json"], tempDir("contract-cwd-"));
    expect(r.code).toBe(0);
    expect(fs.existsSync(`${ws}/rel.png`)).toBe(true);
    expect(r.out.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(r.out)).toMatchObject({ ok: true, out: `${ws}/rel.png`, sidecar: `${ws}/rel.sidecar.json`, warnings: expect.any(Array), ms: expect.any(Number) });
  });

  it("refuses to render or build through a linked out/ folder, with exit 2, and writes nothing there", () => {
    const ws = tmpWorkspace("basic"), outside = tempDir("contract-outside-");
    fs.symlinkSync(outside, `${ws}/out`, "dir");
    for (const args of [["build"], ["render", "plain"]]) {
      const r = run([...args, "--json", "-C", ws]);
      expect(r.code, args.join(" ")).toBe(2);
      expect(JSON.parse(r.out).error.message, args.join(" ")).toMatch(/^out\/.* is reached through a symbolic link/);
    }
    // A link deeper down (out/en) is refused the same way.
    fs.unlinkSync(`${ws}/out`);
    fs.mkdirSync(`${ws}/out`);
    fs.symlinkSync(outside, `${ws}/out/en`, "dir");
    const deep = run(["render", "plain", "--json", "-C", ws]);
    expect(deep.code).toBe(2);
    expect(JSON.parse(deep.out).error.message).toMatch(/^out\/en\/.* is reached through a symbolic link/);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it("refuses to write thumbs and strips through a linked review/ folder, with exit 2", async () => {
    const ws = await renderedStrip(20), outside = tempDir("contract-outside-");
    fs.symlinkSync(outside, `${ws}/review`, "dir");
    for (const cmd of ["thumbs", "strip"]) {
      const r = run([cmd, "android-phone", "--json", "-C", ws]);
      expect(r.code, cmd).toBe(2);
      expect(JSON.parse(r.out).error.message, cmd).toMatch(/^review\/.* is reached through a symbolic link/);
    }
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it("writes only the image for render -o outside the workspace, and says the sidecar was skipped", () => {
    const ws = tmpWorkspace("basic"), outside = tempDir("contract-outside-");
    const r = run(["render", "plain", "-C", ws, "-o", `${outside}/shot.png`, "--json"]);
    expect(r.code).toBe(0);
    expect(fs.readdirSync(outside)).toEqual(["shot.png"]);
    expect(JSON.parse(r.out)).toMatchObject({ ok: true, out: `${outside}/shot.png`, sidecar: null, sidecarSkipped: expect.stringMatching(/outside the workspace/) });
    const human = run(["render", "plain", "-C", ws, "-o", `${outside}/again.png`]);
    expect(human.code).toBe(0);
    expect(human.out).toMatch(/sidecar not written: .*outside the workspace/);
    expect(fs.readdirSync(outside).sort()).toEqual(["again.png", "shot.png"]);
  });

  it("reports thumbs as { ok, file }", async () => {
    const ws = await renderedStrip(20);
    const r = run(["thumbs", "android-phone", "--json", "-C", ws]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ ok: true, file: expect.stringMatching(/review.*\.png$/) });
  });

  it("strip sets ok false and exits 1 on a stepped seam, unless --warn-only", async () => {
    const ws = await renderedStrip(240);
    const r = run(["strip", "android-phone", "--json", "-C", ws]);
    expect(r.code).toBe(1);
    expect(r.out.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(r.out)).toMatchObject({ ok: false, file: expect.any(String), preview: expect.any(String), seams: [expect.objectContaining({ steps: expect.any(Array) })] });
    const w = run(["strip", "android-phone", "--warn-only", "--json", "-C", ws]);
    expect(w.code).toBe(0);
    expect(JSON.parse(w.out).ok).toBe(true);
    const smooth = run(["strip", "android-phone", "--json", "-C", await renderedStrip(20)]);
    expect(smooth.code).toBe(0);
    expect(JSON.parse(smooth.out).ok).toBe(true);
  });

  it("prints compact JSON for check", () => {
    const ws = tmpWorkspace("basic");
    const r = run(["check", "--json", "-C", ws]);
    expect(r.out.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(r.out)).toHaveProperty("ok");
  });
});

describe("launch errors", () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock("playwright"); });
  const launchWith = async (message: string, platform: NodeJS.Platform) => {
    vi.resetModules();
    vi.doMock("playwright", () => ({ chromium: { launch: async () => { throw new Error(message); } } }));
    const { launch } = await import("../src/render/browser.js");
    return launch(platform);
  };

  it("keeps the original message for errors other than a missing browser", async () => {
    await expect(launchWith("spawn ENOENT", "linux")).rejects.toThrow("Chromium failed to start: spawn ENOENT");
  });

  it("gives the install hint only for a missing executable", async () => {
    await expect(launchWith("Executable doesn't exist at /x", "darwin")).rejects.toThrow("npx playwright install chromium");
    await expect(launchWith("Executable doesn't exist at /x", "linux")).rejects.toThrow("npx playwright install --with-deps chromium");
  });
});
