# Shotsmith

App Store and Google Play screenshots, written as code by an AI agent and checked against store rules.

## Install

Needs Node 20 or newer, on macOS or Linux.

```sh
npx shotsmith@0.1.0 init screenshots --app "My App"
cd screenshots
npx playwright install chromium   # once per machine; on Linux: npx playwright install --with-deps chromium
npx shotsmith build
```

`init` creates the workspace and installs a pinned shotsmith into it. Video drafts (`render --video`) also need `ffmpeg` on the PATH.

The agent skill (`skills/store-screenshots`) drives the whole flow: taste, claims, brief, pages, review, build.

- Claude Code: `/plugin marketplace add mohn93/shotsmith`, then `/plugin install shotsmith@shotsmith`.
- Other agents: `shotsmith skill install` copies it to `~/.claude/skills/store-screenshots`; `--dir <folder>` installs it elsewhere, and `shotsmith skill path` prints where the bundled copy is.
- claude.ai: upload `store-screenshots-<version>.zip` from the [GitHub release](https://github.com/mohn93/shotsmith/releases) as a skill. Where it cannot run commands, the skill writes the workspace for you to build locally.

## Examples

[examples/](examples/) holds three fictional apps (Savory, Elsewhere, Daily Arc) for iPhone and Android in English and German, each built with no findings. `npm run examples` builds them.

## Commands

| Command | Does |
| --- | --- |
| `shotsmith init [dir] [--app name]` | Create a workspace |
| `shotsmith render <page> -t <target> -l <locale>` | Render one page (PNG and sidecar) |
| `shotsmith build [-t ...] [-l ...]` | Render everything, export store-ready JPEGs, run all checks, write `export/REPORT.md` |
| `shotsmith check` | Store rules, text fit, fonts and captures |
| `shotsmith claims` | Every visible word comes from `claims.json` with a source |
| `shotsmith thumbs <target> [--width 300]` | Review row |
| `shotsmith strip <target>` | Panorama join and seam check |
| `shotsmith upload apple` and `shotsmith upload play` | Plan, or with `--apply` / `--commit` make, store screenshot changes (see Uploading) |
| `shotsmith skill path` / `skill install [--dir d] [--force]` | Print the bundled agent skill's folder, or copy it to `~/.claude/skills` |

All commands take `-C <dir>` and `--json`. Requires Node 20+ and `npx playwright install chromium`.

## Page kit

Pages are plain HTML that import `shotsmith/kit` (and optionally `shotsmith/kit/three`). See [docs/kit.md](docs/kit.md) for the stage, claims, `headline`, `device`, `lift`, `ready` and what the checks cannot see.

## Uploading

`shotsmith upload apple` and `shotsmith upload play` send `export/` to the stores after `build` passes. Without a flag they only plan: they print what would be kept, deleted and uploaded and the final order, write `export/upload-plan-<store>.json`, and change nothing. Set `"apple": { "bundleId" }` and `"play": { "packageName" }` in `shotsmith.config.json` first.

| Command | Does |
| --- | --- |
| `shotsmith upload apple [--app-version v] [-l ...]` | Plan the screenshot changes for the editable App Store version |
| `shotsmith upload apple --apply` | Make them: delete superseded screenshots, upload, wait for processing, order, and read back into `export/upload-report-apple.json`. Never submits for review |
| `shotsmith upload play [-l ...]` | Plan the changes per listing language and slot |
| `shotsmith upload play --apply` | Stage them in a validated draft edit, print its id and write `export/upload-report-play.json`; nothing is live |
| `shotsmith upload play --commit <editId>` | Publish the staged edit; it must be the one the last `--apply` staged |

`--commit` refuses when `export/upload-report-play.json` names a different edit, names no edit, or cannot be read; delete the report to commit an edit staged elsewhere. For an app whose changes Google will not send for review automatically, use `shotsmith upload play --commit <editId> --changes-not-sent-for-review` (only with `--commit`) and send the changes for review in Play Console afterwards. A Play `--apply` with nothing to change keeps no edit. On App Store Connect, processing waits up to 5 minutes per set.

`--apply` refuses when the exports or the store changed since the saved plan; plan again, and repeat the same `-l` and `--app-version` on `--apply`. A failed `--apply` writes its report and exits 2. On Google Play the draft edit is discarded, so the listing is unchanged; on App Store Connect the version may be left incomplete, so plan and apply again before submitting. Credentials come from the environment or `~/.config/shotsmith/credentials.json`, never from the workspace, and a key file inside a git working tree is refused:

| Store | Environment | `credentials.json` |
| --- | --- | --- |
| App Store Connect (API key, App Manager or Admin role) | `SHOTSMITH_ASC_ISSUER_ID`, `SHOTSMITH_ASC_KEY_ID`, `SHOTSMITH_ASC_KEY_PATH` (.p8) | `"apple": { "issuerId", "keyId", "keyPath" }` |
| Google Play (service account with store listing permission) | `SHOTSMITH_PLAY_KEY_PATH` (JSON key) | `"play": { "keyPath" }` |

## Exit codes and JSON

| Exit code | Meaning |
| --- | --- |
| 0 | Success, no error findings (warnings do not fail) |
| 1 | Error findings (for `strip`, a seam that steps; for `upload`, problems in the plan) |
| 2 | Usage or runtime failure: bad arguments, missing config, a crash, a failed or refused upload |

With `--json` every command prints exactly one JSON object to stdout and nothing else. It always has a boolean `ok`: `ok` is `true` for exit code 0 and `false` otherwise. Commands that check (`check`, `claims`, `build`) add `errors` and `warnings` arrays of `{ rule, severity, message, locale?, target?, page? }`. A runtime failure prints `{ "ok": false, "error": { "message": "..." } }` and exits 2. `upload` adds `plan` and `planFile`, `report` and `reportFile`, or `committed`; under `--apply` with export problems there is a `plan` but no `planFile`, because the saved plan is kept; a failed upload apply carries `error` plus `report` and `reportFile`.

## Development

```sh
npm ci && npm run build
npx playwright install chromium
npm test            # builds first; kit baselines live in test/baselines/<darwin|linux>
npm run examples    # builds the three examples; 0 errors and 0 warnings expected
```

CI runs the same on Ubuntu and macOS. A missing kit baseline is written and its test fails; on CI the new images are kept as a run artifact so they can be reviewed and committed.

## Releasing

See [RELEASE.md](RELEASE.md).
