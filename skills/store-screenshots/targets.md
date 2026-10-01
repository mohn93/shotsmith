# Store targets, formats, frames and fonts

## Sizes

| Target | Size | Store slot | Notes |
| --- | --- | --- | --- |
| `iphone-6.9` | 1290x2796 | App Store `APP_IPHONE_67` | 1320x2868 and 1260x2736 are also accepted (custom target) |
| `iphone-6.5` | 1242x2688 | App Store `APP_IPHONE_65` | Same layout as 6.9, scaled |
| `ipad-13` | 2064x2752 | App Store `APP_IPAD_PRO_3GEN_129` | 4:3: needs its own art direction (`s.pick` key `t43`) |
| `android-phone` | 1080x1920 | Play `phoneScreenshots` | 9:16 (`p916`). Play rejects aspect ratios above 2:1, so iPhone art cannot be reused; re-lay out |
| `android-tablet` | 1440x2560 | Play `sevenInchScreenshots` and `tenInchScreenshots` | One set serves both slots (`t916`) |

App Preview export is not supported in this version; `npx shotsmith render <page> -t <target> --video` records a draft at a screenshot target's size for motion review.

A custom target is `{ "name", "w", "h", "platform" }` in `targets`; Apple targets must use a size App Store Connect accepts. Limits: App Store up to 10 per set; Play up to 8 per slot, 320 to 3840 px per side. Keep one story order across all targets.

## Files

`shotsmith build` writes every export as an opaque RGB baseline JPEG, quality 92, 4:4:4 chroma, at the exact target size, and `check` fails anything else. Not progressive: App Store Connect left progressive uploads failed or unprocessed. Film grain makes PNGs 2 to 4 MB each; JPEG q92 is about a sixth of that and visually identical at 2x zoom.

## Device frames

`device()` draws original vector frames; never use vendor artwork or device photos. It scales the capture uniformly inside the screen area. Status bars, islands and home indicators are presentation chrome drawn around the capture. Many captures already include a status bar: set `statusBar: "included"`, and either show theirs or repaint it (`repaint: true`). Full-screen captures leave no space under the tab bar, so the kit keeps its home indicator clear of the tab labels.

- iPhone: rounded body, dynamic island, 9:41 status bar, home indicator.
- Android phone: flatter corners, centered punch-hole camera, thin even bezel, side buttons on the right, Material status icons, gesture bar.
- iPad: even bezel, camera in the side bezel, "9:41 Wed Sep 9"-style status bar.
- Android tablet: thicker bezel, camera in the top bezel, gesture bar.

## Fonts

- SF Pro, SF Mono and New York are licensed only for mockups of Apple-platform UI. They exist only on macOS with Apple's fonts installed. Name them as `sysfont:<file>` (for example `sysfont:SF-Pro-Display-Bold.otf`) in a role's `apple` source; Shotsmith serves them from the macOS install and never copies them. It searches `~/Library/Fonts`, `/Library/Fonts` and `/System/Library/Fonts`; `FONT_DIRS` overrides that. Install SF Pro from Apple's font download if `/Library/Fonts/SF-Pro-*.otf` is missing.
- Google Play images: Inter (OFL) or Roboto (Apache). For monospace on Android use an OFL font such as JetBrains Mono. Shotsmith refuses Apple-only fonts on Play targets from any source, including a page's own `@font-face` and system fallbacks.
- Give every role a `fallback` that is not Apple-only. On a machine without SF (Linux) Shotsmith uses it and warns (`font.fallback`).
- Open-licence fonts live in `fonts/` with their license file. Sources: the `google/fonts` GitHub repo (font files plus `OFL.txt` per family) or `@fontsource/<family>` npm packages (woff2 plus license). For a serif look, pick an OFL serif (Lora, Fraunces, Source Serif); New York has the same Apple-only terms as SF.
- Inter runs wider than SF: recheck wraps after switching. A string the font does not cover fails (`text.coverage`), so pick fonts that cover every locale's script, or set a per-locale font: `locales[].fonts.<role>` is one source (a file, `sysfont:` or a weights map) that replaces the role for that locale on every store, for example `"fonts": { "text": "fonts/NotoSansArabic-Regular.ttf" }` on the `ar` locale.

## Uploading (only when the user asks)

`shotsmith upload apple` and `shotsmith upload play` send `export/` to the stores. Without a flag they only plan: they print what would be kept, deleted and uploaded and the final order per language and slot, write `export/upload-plan-apple.json` or `export/upload-plan-play.json`, and change nothing. Exit 1 means the plan has problems (exports that fail `check`, a language the store listing lacks, a target with no slot); fix them and plan again.

- Credentials come from the environment or `~/.config/shotsmith/credentials.json`, never from the workspace. A key file inside any git working tree is refused.

  | Store | Environment | `credentials.json` |
  | --- | --- | --- |
  | App Store Connect: API key with the App Manager or Admin role | `SHOTSMITH_ASC_ISSUER_ID`, `SHOTSMITH_ASC_KEY_ID`, `SHOTSMITH_ASC_KEY_PATH` (the .p8 file) | `"apple": { "issuerId", "keyId", "keyPath" }` |
  | Google Play: service account with store listing permission | `SHOTSMITH_PLAY_KEY_PATH` (the JSON key) | `"play": { "keyPath" }` |

- **App Store:** `shotsmith upload apple [--app-version <v>] [-l <codes>] [--apply]`. Screenshots change only on a version in an editable state (Prepare for Submission or rejected); `--app-version` picks one when several are editable. If none is, the user creates a new version (and build) in App Store Connect first. `--apply` keeps screenshots whose MD5 matches and that finished processing, deletes superseded, failed and stuck ones first (10-image cap), uploads the rest, waits up to 5 minutes for processing, orders the set and reads checksums and order back into `export/upload-report-apple.json`. It never submits for review.
- **Google Play:** `shotsmith upload play [-l <codes>] [--apply | --commit <editId>]`. The plan compares each listing language and slot by sha256. `--apply` replaces the changed slots in one draft edit, checks the sha256 values, validates the edit and prints its id; nothing is live. `shotsmith upload play --commit <editId>` publishes it. "No longer has edit": Play discards an edit when anything else changes the app first; run `--apply` again and commit the new edit. With managed publishing, committed changes wait in Publishing overview. A 403 means the service account lacks store listing permission for the app; the user grants it in Play Console.
- `--apply` refuses when the exports, the store, the locales or the version changed since the saved plan. Plan again and show the user the new plan.
- A locale's `apple` or `play` code must already exist on the version or listing; Shotsmith does not add languages or change store text. Custom Apple targets upload only at a size in the 6.9", 6.5" or 13" class.
- Confirm with the user before `--apply`, before `--commit`, and before replacing a live set.
