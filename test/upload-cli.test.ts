import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { print } from "../src/cli/commands/upload.js";
import type { UploadOutcome } from "../src/upload/run.js";
import { ROOT } from "./helpers.js";
import { uploadWorkspace } from "./upload/workspace.js";

let home: string;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), "shotsmith-home-")); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

// A fresh HOME and no SHOTSMITH_* variables, so no real credentials are ever found.
const run = (args: string[], env: NodeJS.ProcessEnv = {}) => {
  const r = spawnSync("node", [`${ROOT}/dist/cli.js`, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, SHOTSMITH_ASC_ISSUER_ID: "", SHOTSMITH_ASC_KEY_ID: "", SHOTSMITH_ASC_KEY_PATH: "", SHOTSMITH_PLAY_KEY_PATH: "", ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const json = (r: { out: string }) => JSON.parse(r.out);

describe("upload command", () => {
  it("documents its flags", () => {
    const a = run(["upload", "apple", "--help"]);
    for (const f of ["--app-version", "--apply", "--locale"]) expect(a.out).toContain(f);
    expect(run(["upload", "play", "--help"]).out).toContain("--commit <editId>");
  });

  it("reports export problems with exit 1 before looking for credentials", async () => {
    const cfg = await uploadWorkspace({ export: false });
    const r = run(["upload", "apple", "--json", "-C", cfg.root]);
    expect(r.code).toBe(1);
    expect(json(r)).toMatchObject({ ok: false, planFile: "export/upload-plan-apple.json", plan: { problems: expect.arrayContaining([expect.stringMatching(/store\.missing/)]) } });
  });

  it("names the missing credentials", async () => {
    const cfg = await uploadWorkspace();
    const a = run(["upload", "apple", "--json", "-C", cfg.root]);
    expect(a.code).toBe(2);
    expect(json(a).error.message).toMatch(/SHOTSMITH_ASC_ISSUER_ID.*credentials\.json/s);
    const p = run(["upload", "play", "--json", "-C", cfg.root]);
    expect(p.code).toBe(2);
    expect(json(p).error.message).toMatch(/SHOTSMITH_PLAY_KEY_PATH/);
  });

  it("refuses a key inside the workspace, and a key that is not a .p8", async () => {
    const cfg = await uploadWorkspace();
    const pem = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    fs.writeFileSync(path.join(cfg.root, "key.p8"), pem);
    const env = { SHOTSMITH_ASC_ISSUER_ID: "iss", SHOTSMITH_ASC_KEY_ID: "kid", SHOTSMITH_ASC_KEY_PATH: path.join(cfg.root, "key.p8") };
    expect(json(run(["upload", "apple", "--json", "-C", cfg.root], env)).error.message).toMatch(/inside the workspace/);
    const bad = path.join(home, "bad.p8");
    fs.writeFileSync(bad, "nope");
    const r = run(["upload", "apple", "--json", "-C", cfg.root], { ...env, SHOTSMITH_ASC_KEY_PATH: bad });
    expect(r.code).toBe(2);
    expect(json(r).error.message).toMatch(/is not an App Store Connect private key/);
  });

  it("rejects --apply with --commit, a bad edit id, an unknown locale and a missing bundle id", async () => {
    const cfg = await uploadWorkspace();
    expect(json(run(["upload", "play", "--apply", "--commit", "1", "--json", "-C", cfg.root])).error.message).toMatch(/either --apply or --commit/);
    expect(json(run(["upload", "play", "--commit", "a b", "--json", "-C", cfg.root])).error.message).toMatch(/not a Play edit id/);
    expect(json(run(["upload", "apple", "-l", "fr", "--json", "-C", cfg.root])).error.message).toMatch(/Unknown locale\(s\): fr/);
    const noApple = await uploadWorkspace({ apple: false });
    const r = run(["upload", "apple", "--json", "-C", noApple.root]);
    expect(r.code).toBe(2);
    expect(json(r).error.message).toMatch(/no "apple"/);
  });

  it("prints the failure line to stderr in text mode and keeps --json to one object on stdout", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitCode = process.exitCode;
    try {
      const failed: UploadOutcome = { ok: false, exitCode: 2, lines: ["en-US: failed", "Upload failed: boom", "Report written to r.json."], json: { error: { message: "boom" } } };
      print(failed);
      expect(stdout.mock.calls).toEqual([["en-US: failed"], ["Report written to r.json."]]);
      expect(stderr.mock.calls).toEqual([["Upload failed: boom"]]);
      expect(process.exitCode).toBe(2);
      stdout.mockClear(); stderr.mockClear();
      print(failed, true);
      expect(stdout.mock.calls).toEqual([[JSON.stringify({ ok: false, error: { message: "boom" } })]]);
      expect(stderr).not.toHaveBeenCalled();
      stdout.mockClear();
      print({ ok: false, exitCode: 1, lines: ["problem: x", "Upload failed: not this"], json: {} });
      expect(stdout).toHaveBeenCalledTimes(2);
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stdout.mockRestore(); stderr.mockRestore();
      process.exitCode = exitCode;
    }
  });

  it("has every flag the skill names", () => {
    const text = fs.readFileSync(path.join(ROOT, "skills/store-screenshots/targets.md"), "utf8");
    const help = run(["upload", "apple", "--help"]).out + run(["upload", "play", "--help"]).out;
    const flags = [...new Set([...text.matchAll(/`[^`]*upload (?:apple|play)[^`]*`/g)].flatMap((m) => m[0].match(/--[a-z-]+/g) ?? []))];
    expect(flags.length).toBeGreaterThan(2);
    for (const f of flags) expect(help, f).toContain(f);
  });
});
