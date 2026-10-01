import crypto from "node:crypto";
import type { PlayKey } from "./credentials.js";
import { StoreError, type Transport, parseJson } from "./http.js";

const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");

// App Store Connect accepts tokens that live at most 20 minutes, so each request signs a fresh one.
export function appleToken(c: { issuerId: string; keyId: string }, privateKey: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  const unsigned = `${b64({ alg: "ES256", kid: c.keyId, typ: "JWT" })}.${b64({ iss: c.issuerId, iat: t - 10, exp: t + 600, aud: "appstoreconnect-v1" })}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${sig.toString("base64url")}`;
}

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

// Exchanges a signed service account assertion for an access token. The token is cached until 5 minutes before it expires.
export function playTokenSource(key: PlayKey, transport: Transport, now: () => number = Date.now): () => Promise<string> {
  let cached: { token: string; until: number } | undefined;
  return async () => {
    if (cached && now() < cached.until) return cached.token;
    const t = Math.floor(now() / 1000);
    // Google refuses assertions that live longer than an hour.
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: key.clientEmail, scope: PLAY_SCOPE, aud: GOOGLE_TOKEN_URL, iat: t - 10, exp: t + 3000 })}`;
    const assertion = `${unsigned}.${crypto.sign("sha256", Buffer.from(unsigned), key.privateKey).toString("base64url")}`;
    const r = await transport({
      method: "POST",
      url: GOOGLE_TOKEN_URL,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });
    const data = parseJson(r.text, "Google sign-in");
    if (r.status !== 200 || typeof data.access_token !== "string") {
      throw new StoreError(`Google rejected the service account key: ${data.error_description ?? data.error ?? `status ${r.status}`}`, r.status);
    }
    cached = { token: data.access_token, until: now() + (Number(data.expires_in) || 3600) * 1000 - 300_000 };
    return cached.token;
  };
}
