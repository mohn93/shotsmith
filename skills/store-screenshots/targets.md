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

- **App Store:** screenshots change only on a version in an editable state (Prepare for Submission). If the live version is the latest, a new version (and build) is needed. Upload through the App Store Connect API: reserve each `appScreenshot`, PUT the parts, PATCH `uploaded: true` with the MD5 `sourceFileChecksum`, poll until `COMPLETE` (allow 5 minutes), then order the set. Delete superseded and unprocessed screenshots first (10-image cap). Read back checksums and order afterwards.
- **Google Play:** create an edit, delete and re-upload each image slot in order, check the returned sha256 values, validate, and commit only after the user confirms. An edit is discarded when anything else changes the app first; re-stage and commit if the commit says "This Edit has been deleted". With managed publishing, committed changes wait in Publishing overview.
- A 403 on creating a Play edit means the service account lacks store listing permission for the app; the user grants it in Play Console.
- Confirm with the user before committing a Play edit, submitting an App Store version, or replacing a live set.
