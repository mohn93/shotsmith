import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ROOT } from "./helpers.js";
import { uploadWorkspace } from "./upload/workspace.js";

let home: string;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), "shotsmith-home-")); });

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
});
