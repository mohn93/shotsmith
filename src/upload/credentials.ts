import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

export interface AppleCredentials { issuerId: string; keyId: string; keyPath: string }
export interface PlayCredentials { keyPath: string }
export interface PlayKey { clientEmail: string; privateKey: string }

const CredentialsFile = z.strictObject({
  apple: z.strictObject({ issuerId: z.string().min(1).optional(), keyId: z.string().min(1).optional(), keyPath: z.string().min(1).optional() }).optional(),
  play: z.strictObject({ keyPath: z.string().min(1).optional() }).optional(),
});
type CredentialsFile = z.infer<typeof CredentialsFile>;

export const credentialsPath = (home = os.homedir()): string => path.join(home, ".config", "shotsmith", "credentials.json");

function readCredentialsFile(home: string): CredentialsFile {
  const file = credentialsPath(home);
  if (!fs.existsSync(file)) return {};
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new Error(`${file} is not valid JSON: ${(e as Error).message}`); }
  const parsed = CredentialsFile.safeParse(raw);
  if (!parsed.success) throw new Error(`${file} has problems: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

// In the credentials file "~/" means the home folder, and other relative paths are relative to the file.
function fromFile(p: string, home: string): string {
  if (p === "~" || p.startsWith("~/")) return path.join(home, p.slice(2));
  return path.resolve(path.dirname(credentialsPath(home)), p);
}

// Each field comes from the environment first, then from credentials.json.
export function appleCredentials(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): AppleCredentials {
  const f = readCredentialsFile(home).apple ?? {};
  const issuerId = env.SHOTSMITH_ASC_ISSUER_ID || f.issuerId;
  const keyId = env.SHOTSMITH_ASC_KEY_ID || f.keyId;
  const keyPath = env.SHOTSMITH_ASC_KEY_PATH ? path.resolve(env.SHOTSMITH_ASC_KEY_PATH) : f.keyPath ? fromFile(f.keyPath, home) : undefined;
  if (!issuerId || !keyId || !keyPath) {
    throw new Error(`App Store Connect credentials are missing. Set SHOTSMITH_ASC_ISSUER_ID, SHOTSMITH_ASC_KEY_ID and SHOTSMITH_ASC_KEY_PATH, or add "apple": { "issuerId", "keyId", "keyPath" } to ${credentialsPath(home)}`);
  }
  return { issuerId, keyId, keyPath };
}

export function playCredentials(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): PlayCredentials {
  const f = readCredentialsFile(home).play ?? {};
  const keyPath = env.SHOTSMITH_PLAY_KEY_PATH ? path.resolve(env.SHOTSMITH_PLAY_KEY_PATH) : f.keyPath ? fromFile(f.keyPath, home) : undefined;
  if (!keyPath) throw new Error(`Google Play credentials are missing. Set SHOTSMITH_PLAY_KEY_PATH to a service account JSON key, or add "play": { "keyPath" } to ${credentialsPath(home)}`);
  return { keyPath };
}

// The folder of the git working tree that holds p, or null.
export function gitWorkTree(p: string): string | null {
  for (let dir = path.dirname(p); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

const within = (p: string, dir: string): boolean => {
  const r = path.relative(dir, p);
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
};

// Store keys are read only from outside the workspace and outside any git working tree, where they could be committed.
// The check uses the real path, so a link cannot hide where the key is.
export function readKey(keyPath: string, workspace: string): string {
  let real: string;
  try { real = fs.realpathSync(keyPath); } catch { throw new Error(`Key file ${keyPath} does not exist`); }
  const move = "Move it outside any repository, for example to ~/.config/shotsmith/, and point the credentials at it";
  if (within(real, fs.realpathSync(workspace))) throw new Error(`Key file ${keyPath} is inside the workspace, where it could be committed. ${move}`);
  const repo = gitWorkTree(real);
  if (repo) throw new Error(`Key file ${keyPath} is inside the git working tree ${repo}, where it could be committed. ${move}`);
  return fs.readFileSync(real, "utf8");
}

// Only the email and the private key are used. Tokens always come from Google's token endpoint, whatever token_uri says.
export function playKey(json: string, keyPath: string): PlayKey {
  let k: Record<string, unknown> | null;
  try { k = JSON.parse(json); } catch { throw new Error(`${keyPath} is not a Google service account JSON key`); }
  if (typeof k?.client_email !== "string" || typeof k?.private_key !== "string") throw new Error(`${keyPath} is not a Google service account JSON key (no client_email or private_key)`);
  try { crypto.createPrivateKey(k.private_key); } catch { throw new Error(`${keyPath} holds a private_key that is not a usable private key`); }
  return { clientEmail: k.client_email, privateKey: k.private_key };
}
