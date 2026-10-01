import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { appleDeps, playDeps } from "../src/upload/connect.js";
import type { HttpRequest, HttpResponse, Transport } from "../src/upload/http.js";

// Outside the repository on purpose: keys inside a git working tree are refused.
const made: string[] = [];
const tmp = (p: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `shotsmith-${p}-`));
  made.push(dir);
  return dir;
};
afterAll(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });

const pem = (type: "ec" | "rsa") => (type === "ec"
  ? crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })
  : crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function setup() {
  const root = tmp("ws"), home = tmp("home"), keys = tmp("keys");
  const p8 = path.join(keys, "key.p8"), play = path.join(keys, "play.json");
  fs.writeFileSync(p8, pem("ec"));
  fs.writeFileSync(play, JSON.stringify({ client_email: "svc@example.iam", private_key: pem("rsa") }));
  const env = { SHOTSMITH_ASC_ISSUER_ID: "iss", SHOTSMITH_ASC_KEY_ID: "kid", SHOTSMITH_ASC_KEY_PATH: p8, SHOTSMITH_PLAY_KEY_PATH: play };
  return { root, home, env };
}

// Answers 503, then 200, and records every call.
function flaky() {
  const calls: HttpRequest[] = [];
  const base: Transport = async (req) => {
    calls.push(req);
    return { status: calls.length === 1 ? 503 : 200, text: "{}" } satisfies HttpResponse;
  };
  return { calls, base };
}
const sleep = async () => {};

describe("appleDeps", () => {
  it("retries a GET through the base transport", async () => {
    const { root, home, env } = setup();
    const { calls, base } = flaky();
    const deps = appleDeps(root, { env, home, base, sleep });
    expect((await deps.transport({ method: "GET", url: "https://api.appstoreconnect.apple.com/v1/apps" })).status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(deps.token().split(".")).toHaveLength(3);
  });

  it("logs unless the output is JSON", () => {
    const { root, home, env } = setup();
    expect(appleDeps(root, { env, home, json: true }).log).toBeUndefined();
    expect(appleDeps(root, { env, home }).log).toBeTypeOf("function");
  });

  it("names a key that is not a .p8, and missing credentials", () => {
    const { root, home, env } = setup();
    const bad = path.join(tmp("keys"), "bad.p8");
    fs.writeFileSync(bad, "nope");
    expect(() => appleDeps(root, { env: { ...env, SHOTSMITH_ASC_KEY_PATH: bad }, home })).toThrow(/is not an App Store Connect private key/);
    expect(() => appleDeps(root, { env: {}, home })).toThrow(/credentials are missing/);
  });
});

describe("playDeps", () => {
  it("retries a GET through the base transport", async () => {
    const { root, home, env } = setup();
    const { calls, base } = flaky();
    const deps = playDeps(root, { env, home, base, sleep });
    expect((await deps.transport({ method: "GET", url: "https://androidpublisher.googleapis.com/x" })).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("logs unless the output is JSON", () => {
    const { root, home, env } = setup();
    expect(playDeps(root, { env, home, json: true }).log).toBeUndefined();
    expect(playDeps(root, { env, home }).log).toBeTypeOf("function");
  });
});
