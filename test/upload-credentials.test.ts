import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { appleCredentials, credentialsPath, gitWorkTree, playCredentials, playKey, readKey } from "../src/upload/credentials.js";

// Outside the repository on purpose: keys inside a git working tree are refused.
const made: string[] = [];
const tmp = (p: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `shotsmith-${p}-`));
  made.push(dir);
  return dir;
};
afterAll(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });
function homeWith(content: unknown): string {
  const home = tmp("home");
  fs.mkdirSync(path.dirname(credentialsPath(home)), { recursive: true });
  fs.writeFileSync(credentialsPath(home), typeof content === "string" ? content : JSON.stringify(content));
  return home;
}

describe("credentials", () => {
  it("reads App Store Connect credentials from the environment", () => {
    const env = { SHOTSMITH_ASC_ISSUER_ID: "iss", SHOTSMITH_ASC_KEY_ID: "kid", SHOTSMITH_ASC_KEY_PATH: "/keys/a.p8" };
    expect(appleCredentials(env, tmp("home"))).toEqual({ issuerId: "iss", keyId: "kid", keyPath: "/keys/a.p8" });
  });

  it("falls back to credentials.json per field, resolving ~ and relative key paths", () => {
    const home = homeWith({ apple: { issuerId: "file-iss", keyId: "file-kid", keyPath: "~/keys/a.p8" }, play: { keyPath: "play.json" } });
    expect(appleCredentials({ SHOTSMITH_ASC_KEY_ID: "env-kid" }, home)).toEqual({ issuerId: "file-iss", keyId: "env-kid", keyPath: path.join(home, "keys/a.p8") });
    expect(playCredentials({}, home)).toEqual({ keyPath: path.join(home, ".config/shotsmith/play.json") });
    expect(playCredentials({ SHOTSMITH_PLAY_KEY_PATH: "/keys/p.json" }, home)).toEqual({ keyPath: "/keys/p.json" });
  });

  it("names every way to provide missing credentials", () => {
    expect(() => appleCredentials({}, tmp("home"))).toThrow(/SHOTSMITH_ASC_ISSUER_ID, SHOTSMITH_ASC_KEY_ID and SHOTSMITH_ASC_KEY_PATH.*credentials\.json/);
    expect(() => playCredentials({}, tmp("home"))).toThrow(/SHOTSMITH_PLAY_KEY_PATH.*credentials\.json/);
  });

  it("rejects a credentials file that is not valid", () => {
    expect(() => appleCredentials({}, homeWith("{"))).toThrow(/is not valid JSON/);
    expect(() => appleCredentials({}, homeWith({ apple: { keyID: "x" } }))).toThrow(/has problems: apple/);
  });
});

describe("readKey", () => {
  it("runs with os.tmpdir() outside any git working tree", () => {
    expect(gitWorkTree(fs.realpathSync(os.tmpdir())), "os.tmpdir() is inside a git working tree; key-guard tests need it outside").toBeNull();
  });

  it("reads a key outside the workspace and any repository", () => {
    const dir = tmp("keys");
    fs.writeFileSync(path.join(dir, "k.p8"), "KEY");
    expect(readKey(path.join(dir, "k.p8"), tmp("ws"))).toBe("KEY");
  });

  it("refuses a key inside the workspace", () => {
    const ws = tmp("ws");
    fs.writeFileSync(path.join(ws, "k.p8"), "KEY");
    expect(() => readKey(path.join(ws, "k.p8"), ws)).toThrow(/inside the workspace/);
  });

  it("refuses a key inside a git working tree, also through a link", () => {
    const repo = tmp("repo");
    fs.mkdirSync(path.join(repo, ".git"));
    fs.mkdirSync(path.join(repo, "secrets"));
    fs.writeFileSync(path.join(repo, "secrets/k.p8"), "KEY");
    expect(() => readKey(path.join(repo, "secrets/k.p8"), tmp("ws"))).toThrow(/inside the git working tree/);
    const links = tmp("links");
    fs.symlinkSync(path.join(repo, "secrets/k.p8"), path.join(links, "k.p8"));
    expect(() => readKey(path.join(links, "k.p8"), tmp("ws"))).toThrow(/inside the git working tree/);
    expect(gitWorkTree(fs.realpathSync(path.join(repo, "secrets/k.p8")))).toBe(fs.realpathSync(repo));
  });

  // On a case-insensitive volume the same folder can be written in another letter case; the guard must still see it.
  const sameFolder = (() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shotsmith-case-"));
    made.push(dir);
    return fs.existsSync(path.join(path.dirname(dir), path.basename(dir).toUpperCase()));
  })();
  it.skipIf(!sameFolder)("refuses a key inside the workspace when its path differs only in letter case", () => {
    const ws = tmp("ws");
    fs.writeFileSync(path.join(ws, "k.p8"), "KEY");
    const upper = path.join(path.dirname(ws), path.basename(ws).toUpperCase(), "k.p8");
    expect(() => readKey(upper, ws)).toThrow(/inside the workspace/);
  });

  it("names a missing key file", () => {
    expect(() => readKey("/nope/k.p8", tmp("ws"))).toThrow(/does not exist/);
  });
});

describe("playKey", () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("takes the email and private key and ignores token_uri", () => {
    const json = JSON.stringify({ client_email: "up@demo.iam.gserviceaccount.com", private_key: pem, token_uri: "https://evil.example/token" });
    expect(playKey(json, "k.json")).toEqual({ clientEmail: "up@demo.iam.gserviceaccount.com", privateKey: pem });
  });

  it("rejects files that are not service account keys", () => {
    expect(() => playKey("{", "k.json")).toThrow(/k\.json is not a Google service account JSON key/);
    expect(() => playKey(JSON.stringify({ client_email: "a" }), "k.json")).toThrow(/no client_email or private_key/);
    expect(() => playKey(JSON.stringify({ client_email: "a", private_key: "nope" }), "k.json")).toThrow(/not a usable private key/);
  });
});
