import type { AppleDeps } from "./apple.js";
import { appleToken, playTokenSource } from "./auth.js";
import { appleCredentials, playCredentials, playKey, readKey } from "./credentials.js";
import { type Transport, fetchTransport, retrying } from "./http.js";
import type { PlayDeps } from "./play.js";

// env and home default to the process's; base is the network, and sleep the wait between retries (tests replace them).
export interface ConnectOptions { json?: boolean; env?: NodeJS.ProcessEnv; home?: string; base?: Transport; sleep?: (ms: number) => Promise<void> }

// Progress lines only in text mode: --json prints exactly one object.
const logger = (json?: boolean) => (json ? undefined : (line: string) => console.log(line));

export function appleDeps(root: string, o: ConnectOptions = {}): AppleDeps {
  const creds = appleCredentials(o.env, o.home);
  const key = readKey(creds.keyPath, root, o.home);
  try { appleToken(creds, key); } catch { throw new Error(`${creds.keyPath} is not an App Store Connect private key (.p8)`); }
  return { transport: retrying(o.base ?? fetchTransport(), o.sleep), token: () => appleToken(creds, key), log: logger(o.json) };
}

export function playDeps(root: string, o: ConnectOptions = {}): PlayDeps {
  const creds = playCredentials(o.env, o.home);
  const key = playKey(readKey(creds.keyPath, root, o.home), creds.keyPath);
  const transport = retrying(o.base ?? fetchTransport(), o.sleep);
  return { transport, token: playTokenSource(key, transport), log: logger(o.json) };
}
