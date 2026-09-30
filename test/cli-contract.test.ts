import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/schema.js";
import { outPath } from "../src/render/render.js";
import { ROOT, tempDir, tmpWorkspace } from "./helpers.js";

const run = (args: string[], cwd = ROOT) => {
  const r = spawnSync("node", [`${ROOT}/dist/cli.js`, ...args], { encoding: "utf8", cwd });
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
    for (const args of [["--fps", "abc"], ["--fps", "0"], ["--fps", "121"], ["--duration", "0"], ["--duration", "61"], ["--duration", "x"]]) {
      const started = Date.now();
      const r = run(["render", "plain", ...args, "--json", "-C", ws]);
      expect(r.code, args.join(" ")).toBe(2);
      expect(JSON.parse(r.out).error.message).toMatch(new RegExp(args[0]));
      expect(Date.now() - started, args.join(" ")).toBeLessThan(3000);
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
