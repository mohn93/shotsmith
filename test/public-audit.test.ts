import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without types
import { findSecrets } from "../scripts/audit-history.mjs";
import { ROOT, tempDir } from "./helpers.js";

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);

// A file is binary if its first 8 KB hold a NUL byte; every other tracked file is scanned as text.
const isBinary = (buf: Buffer): boolean => buf.subarray(0, 8192).includes(0);
const texts = tracked.filter((f) => {
  const file = path.join(ROOT, f);
  return fs.existsSync(file) && !isBinary(fs.readFileSync(file));
});

// SF prefix is case-sensitive (real Apple files use those capitals); New York is not.
const isAppleFont = (file: string): boolean => /\.(otf|ttf|ttc|woff2?)$/i.test(file) && /^\.?(SF|[Nn][Ee][Ww] ?[Yy][Oo][Rr][Kk])/.test(path.basename(file));
const isEnvFile = (base: string): boolean => /^\.env(\.|$)/.test(base) && !/^\.env\.(example|sample|template)$/.test(base);
const isCredentialFile = (file: string): boolean => {
  const base = path.basename(file);
  return /\.(p8|p12|pem|key|keystore|jks)$|(^|\/)credentials\.json$|google-services\.json$/i.test(base) || isEnvFile(base);
};

describe("public repository audit", () => {
  it("tracks no Apple-only fonts", () => {
    expect(tracked.filter(isAppleFont)).toEqual([]);
  });

  it("recognises Apple font names by their exact SF capitals", () => {
    for (const f of ["SF-Pro.otf", "SFNS.ttf", "SFCompact.ttc", "fonts/SFMono.woff2", "NewYork.otf", "New York.ttf", "newyork.woff"]) expect(isAppleFont(f), f).toBe(true);
    for (const f of ["sfmono-like.ttf", "Sfpro.otf", "Inter.ttf", "SF-Pro.txt"]) expect(isAppleFont(f), f).toBe(false);
  });

  it("tracks no key or credential files", () => {
    expect(tracked.filter(isCredentialFile)).toEqual([]);
  });

  it("flags .env and .env.<name> but not the example, sample and template files", () => {
    for (const f of [".env", ".env.local", ".env.production", "app/.env", "app/.env.staging"]) expect(isCredentialFile(f), f).toBe(true);
    for (const f of [".env.example", ".env.sample", ".env.template", "app/.env.example", ".envrc", "env.ts"]) expect(isCredentialFile(f), f).toBe(false);
  });

  it("scans every tracked file that is not binary, whatever its extension", () => {
    expect(texts).toEqual(expect.arrayContaining(["LICENSE", "package.json", "templates/init/gitignore"]));
    expect(isBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]))).toBe(true);
    expect(isBinary(Buffer.concat([Buffer.alloc(8192, 97), Buffer.from([0])]))).toBe(false);
    expect(isBinary(Buffer.from("plain text, no NUL"))).toBe(false);
    expect(texts.filter((f) => /\.(png|jpg|ttf|woff2)$/i.test(f))).toEqual([]);
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
    expect(findSecrets(`t=${"github"}_pat_${"a".repeat(30)}`)).toEqual(["GitHub fine-grained token"]);
    expect(findSecrets(`k=${"sk"}-ant-${"a".repeat(30)}`)).toEqual(["Anthropic API key"]);
    expect(findSecrets(`k=${"sk"}_live_${"a".repeat(24)}`)).toEqual(["Stripe secret key"]);
    expect(findSecrets(`k=${"rk"}_live_${"A1".repeat(12)}`)).toEqual(["Stripe secret key"]);
    expect(findSecrets(`k=${"sk"}_test_${"a".repeat(24)}`)).toEqual([]);
    expect(findSecrets(`k=${"sk"}_live_${"a".repeat(10)}`)).toEqual([]);
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

  it("scans the combined diff of a merge, where a secret added in the conflict resolution lives", () => {
    const dir = tempDir("audit-merge-");
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.copyFileSync(path.join(ROOT, "scripts/audit-history.mjs"), path.join(dir, "scripts/audit-history.mjs"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q", "-b", "main");
    fs.writeFileSync(path.join(dir, "f.txt"), "base\n");
    git("add", "f.txt"); git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "side");
    fs.writeFileSync(path.join(dir, "f.txt"), "side\n");
    git("commit", "-q", "-am", "side");
    git("checkout", "-q", "main");
    fs.writeFileSync(path.join(dir, "f.txt"), "main\n");
    git("commit", "-q", "-am", "main");
    expect(() => git("merge", "side")).toThrow();
    fs.writeFileSync(path.join(dir, "f.txt"), `key=${"sk"}_live_${"a".repeat(24)}\n`);
    git("commit", "-q", "-am", "resolve");
    const result = spawnSync("node", ["scripts/audit-history.mjs"], { cwd: dir, encoding: "utf8" });
    expect(result.stdout).toContain("Stripe secret key");
    expect(result.stdout).not.toContain("a".repeat(24));
    expect(result.status).toBe(1);
  });

  it("exits 0 with clean message when git succeeds and no secrets found", () => {
    const result = spawnSync("node", ["scripts/audit-history.mjs"], { cwd: ROOT, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No secrets found in history");
  });
});
