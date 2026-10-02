import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without types
import { findSecrets } from "../scripts/audit-history.mjs";
import { ROOT } from "./helpers.js";

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
const TEXT = /\.(ts|mjs|js|json|md|html|css|yml|yaml|txt|svg)$/i;
const texts = tracked.filter((f) => TEXT.test(f) && fs.existsSync(path.join(ROOT, f)));

describe("public repository audit", () => {
  it("tracks no Apple-only fonts", () => {
    expect(tracked.filter((f) => /\.(otf|ttf|ttc|woff2?)$/i.test(f) && /^\.?(SF|New ?York)/i.test(path.basename(f)))).toEqual([]);
  });

  it("tracks no key or credential files", () => {
    expect(tracked.filter((f) => /\.(p8|p12|pem|key|keystore|jks)$|(^|\/)\.env(\.|$)|(^|\/)credentials\.json$|google-services\.json$/i.test(path.basename(f)) || /(^|\/)\.env/.test(f))).toEqual([]);
  });

  it("has no secrets in tracked text", () => {
    const hits = texts.flatMap((f) => findSecrets(fs.readFileSync(path.join(ROOT, f), "utf8")).map((p: string) => `${f}: ${p}`));
    expect(hits).toEqual([]);
  });

  it("has no personal home paths in tracked text", () => {
    expect(texts.filter((f) => /\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\//.test(fs.readFileSync(path.join(ROOT, f), "utf8")))).toEqual([]);
  });

  it("tracks no file over 5 MB", () => {
    expect(tracked.filter((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).size > 5 * 1024 * 1024)).toEqual([]);
  });
});

describe("findSecrets", () => {
  // Samples are built from pieces so this file does not trip the tracked-text scan above.
  it("names each kind of secret it finds and ignores ordinary text", () => {
    const pem = [`-----BEGIN ${"PRIVATE"} KEY-----`, "MIIB", `-----END ${"PRIVATE"} KEY-----`].join("\n");
    expect(findSecrets(pem)).toEqual(["private key"]);
    expect(findSecrets(`id: AKIA${"A".repeat(16)}`)).toEqual(["AWS access key"]);
    expect(findSecrets(`t=ghp_${"a".repeat(36)}`)).toEqual(["GitHub token"]);
    expect(findSecrets(`t=npm_${"a".repeat(36)}`)).toEqual(["npm token"]);
    expect(findSecrets(`k=AIza${"a".repeat(35)}`)).toEqual(["Google API key"]);
    expect(findSecrets(`x=${"xox"}b-1234567890-abc`)).toEqual(["Slack token"]);
    expect(findSecrets("generateKeyPairSync(\"ec\") and a private_key field name")).toEqual([]);
  });
});

describe("audit-history CLI", () => {
  it("fails with exit 2 and no clean message when git is unavailable", () => {
    const tmpDir = path.join(ROOT, "test", ".tmp", "nonexistent-git-dir");
    const result = spawnSync("node", ["scripts/audit-history.mjs"], { cwd: ROOT, env: { ...process.env, GIT_DIR: tmpDir }, encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("No secrets found");
  });

  it("exits 0 with clean message when git succeeds and no secrets found", () => {
    const result = spawnSync("node", ["scripts/audit-history.mjs"], { cwd: ROOT, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No secrets found in history");
  });
});
