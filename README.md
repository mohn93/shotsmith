# Shotsmith

App Store and Google Play screenshots, written as code by an AI agent and checked against store rules. Pre-release.

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

All commands take `-C <dir>` and `--json`. Requires Node 20+ and `npx playwright install chromium`.
