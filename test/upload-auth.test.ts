import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { GOOGLE_TOKEN_URL, PLAY_SCOPE, appleToken, playTokenSource } from "../src/upload/auth.js";
import { type HttpRequest, StoreError, type Transport, fetchTransport, parseJson } from "../src/upload/http.js";

const part = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString());

describe("fetchTransport", () => {
  it("sends method, headers and body, and returns status and text", async () => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { res.writeHead(201, { "Retry-After": "7" }); res.end(JSON.stringify({ method: req.method, auth: req.headers.authorization, body })); });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const { port } = server.address() as AddressInfo;
      const r = await fetchTransport()({ method: "PATCH", url: `http://127.0.0.1:${port}/x`, headers: { Authorization: "Bearer t" }, body: "hi" });
      expect(r.status).toBe(201);
      expect(r.headers?.["retry-after"]).toBe("7");
      expect(JSON.parse(r.text)).toEqual({ method: "PATCH", auth: "Bearer t", body: "hi" });
    } finally {
      server.close();
    }
  });

  it("refuses a redirect instead of re-sending the body to another host", async () => {
    let reached = false;
    const target = http.createServer((req, res) => { reached = true; req.resume(); res.writeHead(200); res.end("x"); });
    await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
    const first = http.createServer((req, res) => {
      req.resume();
      res.writeHead(307, { Location: `http://127.0.0.1:${(target.address() as AddressInfo).port}/stolen` });
      res.end();
    });
    await new Promise<void>((r) => first.listen(0, "127.0.0.1", r));
    try {
      const { port } = first.address() as AddressInfo;
      await expect(fetchTransport()({ method: "PUT", url: `http://127.0.0.1:${port}/up`, body: "bytes" })).rejects.toThrow();
      expect(reached).toBe(false);
    } finally {
      first.closeAllConnections?.();
      target.closeAllConnections?.();
      first.close();
      target.close();
    }
  });
});

describe("parseJson", () => {
  it("reads JSON, treats an empty body as {}, and names the store on anything else", () => {
    expect(parseJson('{"a":1}', "X")).toEqual({ a: 1 });
    expect(parseJson("", "X")).toEqual({});
    expect(() => parseJson("<html>", "App Store Connect")).toThrow(/App Store Connect answered with something that is not JSON: <html>/);
  });
});

describe("appleToken", () => {
  it("signs an ES256 token App Store Connect accepts", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const [h, p, s] = appleToken({ issuerId: "iss", keyId: "KEY123" }, pem, 1_700_000_000_000).split(".");
    expect(part(h)).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    expect(part(p)).toEqual({ iss: "iss", iat: 1_699_999_990, exp: 1_700_000_600, aud: "appstoreconnect-v1" });
    expect(crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
  });
});

describe("playTokenSource", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = { clientEmail: "up@demo.iam.gserviceaccount.com", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };

  it("exchanges a signed assertion at Google's token endpoint and caches the token", async () => {
    const seen: HttpRequest[] = [];
    const transport: Transport = async (req) => { seen.push(req); return { status: 200, text: JSON.stringify({ access_token: "tok", expires_in: 3600 }) }; };
    let clock = 1_700_000_000_000;
    const token = playTokenSource(key, transport, () => clock);
    expect(await token()).toBe("tok");
    expect(await token()).toBe("tok");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", url: GOOGLE_TOKEN_URL, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const form = new URLSearchParams(String(seen[0].body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [h, p, s] = String(form.get("assertion")).split(".");
    expect(part(h)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(part(p)).toEqual({ iss: key.clientEmail, scope: PLAY_SCOPE, aud: GOOGLE_TOKEN_URL, iat: 1_699_999_990, exp: 1_700_003_000 });
    expect(crypto.verify("sha256", Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, "base64url"))).toBe(true);
    clock += 56 * 60_000;
    await token();
    expect(seen).toHaveLength(2);
  });

  it("explains a rejected key", async () => {
    const transport: Transport = async () => ({ status: 400, text: JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }) });
    const failure = playTokenSource(key, transport)();
    await expect(failure).rejects.toThrow(/Google rejected the service account key: Invalid JWT Signature\./);
    await expect(failure).rejects.toBeInstanceOf(StoreError);
  });
});
