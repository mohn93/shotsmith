# Shotsmith

App Store and Google Play screenshots, written as code by an AI agent and checked against store rules. Pre-release.

## Install

Shotsmith is not on npm yet. Until it is, build it from source and link it:

```sh
git clone https://github.com/mohn93/shotsmith && cd shotsmith
npm ci && npm run build && npm link
npx playwright install chromium
```

The agent skill (`skills/store-screenshots`) drives the whole flow: taste, claims, brief, pages, review, build.

- Claude Code: `/plugin marketplace add mohn93/shotsmith`, then `/plugin install shotsmith@shotsmith`.
- Other agents: `shotsmith skill install` copies it to `~/.claude/skills/store-screenshots`; `--dir <folder>` installs it elsewhere, and `shotsmith skill path` prints where the bundled copy is.

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
| `shotsmith skill path` / `skill install [--dir d] [--force]` | Print the bundled agent skill's folder, or copy it to `~/.claude/skills` |

All commands take `-C <dir>` and `--json`. Requires Node 20+ and `npx playwright install chromium`.

## Page kit

Pages are plain HTML that import `shotsmith/kit` (and optionally `shotsmith/kit/three`). See [docs/kit.md](docs/kit.md) for the stage, claims, `headline`, `device`, `lift`, `ready` and what the checks cannot see.

## Exit codes and JSON

| Exit code | Meaning |
| --- | --- |
| 0 | Success, no error findings (warnings do not fail) |
| 1 | Error findings (for `strip`, a seam that steps) |
| 2 | Usage or runtime failure: bad arguments, missing config, a crash |

With `--json` every command prints exactly one JSON object to stdout and nothing else. It always has a boolean `ok`: `ok` is `true` for exit code 0 and `false` otherwise. Commands that check (`check`, `claims`, `build`) add `errors` and `warnings` arrays of `{ rule, severity, message, locale?, target?, page? }`. A runtime failure prints `{ "ok": false, "error": { "message": "..." } }` and exits 2.
