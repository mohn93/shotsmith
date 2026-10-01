import type { Command } from "commander";
import { loadConfig } from "../../config/schema.js";
import { appleDeps, playDeps } from "../../upload/connect.js";
import { type UploadOutcome, runApple, runPlay } from "../../upload/run.js";
import { globals, list } from "../output.js";

// In text mode a failed upload sends its "Upload failed:" line to stderr and the rest to stdout.
export function print(out: UploadOutcome, json?: boolean): void {
  if (json) console.log(JSON.stringify({ ok: out.ok, ...out.json }));
  else for (const line of out.lines) (out.exitCode === 2 && line.startsWith("Upload failed:") ? console.error : console.log)(line);
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
      print(await runApple(cfg, { locales: o.locale, version: o.appVersion, apply: !!o.apply }, () => appleDeps(cfg.root, { json: g.json })), g.json);
    });
  upload.command("play").description("plan the Google Play screenshot changes, stage them in a draft edit with --apply, or publish an edit with --commit")
    .option("-l, --locale <codes>", "limit to locales (repeat or comma-separate)", list)
    .option("--apply", "stage the planned changes in a validated draft edit; only after the user confirms the plan")
    .option("--commit <editId>", "publish a staged edit; only after the user confirms")
    .action(async (o, cmd: Command) => {
      const g = globals(cmd);
      const cfg = loadConfig(g.cwd);
      print(await runPlay(cfg, { locales: o.locale, apply: !!o.apply, commit: o.commit }, () => playDeps(cfg.root, { json: g.json })), g.json);
    });
}
