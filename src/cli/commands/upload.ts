import type { Command } from "commander";
import { loadConfig } from "../../config/schema.js";
import type { AppleDeps } from "../../upload/apple.js";
import { appleToken, playTokenSource } from "../../upload/auth.js";
import { appleCredentials, playCredentials, playKey, readKey } from "../../upload/credentials.js";
import { fetchTransport } from "../../upload/http.js";
import type { PlayDeps } from "../../upload/play.js";
import { type UploadOutcome, runApple, runPlay } from "../../upload/run.js";
import { globals } from "../output.js";

const list = (v: string, prev: string[] = []) => [...prev, ...v.split(",")];
// Progress lines only in text mode: --json prints exactly one object.
const logger = (json?: boolean) => (json ? undefined : (line: string) => console.log(line));

function appleDeps(root: string, json?: boolean): AppleDeps {
  const creds = appleCredentials();
  const key = readKey(creds.keyPath, root);
  try { appleToken(creds, key); } catch { throw new Error(`${creds.keyPath} is not an App Store Connect private key (.p8)`); }
  return { transport: fetchTransport(), token: () => appleToken(creds, key), log: logger(json) };
}

function playDeps(root: string, json?: boolean): PlayDeps {
  const creds = playCredentials();
  const key = playKey(readKey(creds.keyPath, root), creds.keyPath);
  const transport = fetchTransport();
  return { transport, token: playTokenSource(key, transport), log: logger(json) };
}

function print(out: UploadOutcome, json?: boolean): void {
  if (json) console.log(JSON.stringify({ ok: out.ok, ...out.json }));
  else for (const line of out.lines) console.log(line);
  process.exitCode = out.exitCode;
}

export function registerUpload(program: Command) {
  const upload = program.command("upload").description("upload the exports to App Store Connect or Google Play; only plans unless --apply or --commit");
  upload.command("apple").description("plan the App Store screenshot changes for the editable version, or make them with --apply")
    .option("--app-version <v>", "the App Store version to change, when several are editable")
    .option("-l, --locale <codes>", "limit to locales (repeat or comma-separate)", list)
    .option("--apply", "make the planned changes; only after the user confirms the plan")
    .action(async (o, cmd: Command) => {
      const g = globals(cmd);
      const cfg = loadConfig(g.cwd);
      print(await runApple(cfg, { locales: o.locale, version: o.appVersion, apply: !!o.apply }, () => appleDeps(cfg.root, g.json)), g.json);
    });
  upload.command("play").description("plan the Google Play screenshot changes, stage them in a draft edit with --apply, or publish an edit with --commit")
    .option("-l, --locale <codes>", "limit to locales (repeat or comma-separate)", list)
    .option("--apply", "stage the planned changes in a validated draft edit; only after the user confirms the plan")
    .option("--commit <editId>", "publish a staged edit; only after the user confirms")
    .action(async (o, cmd: Command) => {
      const g = globals(cmd);
      const cfg = loadConfig(g.cwd);
      print(await runPlay(cfg, { locales: o.locale, apply: !!o.apply, commit: o.commit }, () => playDeps(cfg.root, g.json)), g.json);
    });
}
