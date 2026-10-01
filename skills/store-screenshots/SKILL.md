---
name: store-screenshots
description: Use when creating App Store or Google Play screenshot sets, App Preview videos, or store device frames for any app, especially when the user describes a look or mood, names apps whose screenshots they like, or wants premium, flashy, 3D, cinematic or panoramic screenshots rather than a template or editor output.
---

# Store screenshots with Shotsmith

## Overview

Write each screenshot as a web page (Three.js, GLSL, SVG/Canvas2D, GSAP, HTML/CSS type) and let Shotsmith do the rule-bound parts: rendering in headless Chromium, device frames and status bars, headline fit, lifted cards, fonts per store, store-ready exports, and the checks for store rules, text fit and claims. Art-direct your own renders until they hold up next to top listings. The user's taste drives the direction; the styles in `styles.md` are starting points, not the only options.

This skill targets Shotsmith 0.1.0. Before a workspace exists run `npx shotsmith@0.1.0 <command>`; inside a workspace run `npx shotsmith <command>`, which uses the version installed there. Every command takes `--json` and exits 0 (no errors), 1 (error findings) or 2 (usage or runtime failure).

## 1. Get the user's taste

**If the user already described a look** (mood, colors, type, textures, apps they like, things to avoid), do not ask them to pick a style: their words become the direction brief in step 3.

**Otherwise** ask in one AskUserQuestion call (one chat message where that tool does not exist). The tool holds at most four questions of two to four options each and adds "Other" for free text, so keep to these:

- **Feel:** "Describe the feel you want: mood, apps whose screenshots you like, colors, typography, anything to avoid. Or start from one of these directions." Options: up to four styles from `styles.md` that fit the app, Cinematic first; the user's own description arrives through "Other".
- **Targets** (multi-select): iPhone, iPad, Android phone, Android tablet. iPhone means 6.9; add 6.5 only when the user asks. Sizes: `targets.md`.
- **Locales:** for example "English only" and "Every language the listing has"; a list arrives through "Other".
- **Source of truth:** where the current captures (per platform and locale) and the verified store copy live; for example "I will attach them" and "In this repository", with a path through "Other".

Before asking, show the matching style previews (`previews/cinematic.jpg`, `previews/three-studio.jpg`, `previews/glsl-shader.jpg`, `previews/svg-gsap.jpg`, `previews/panorama.jpg`, made for DNS Kit) and the complete example sets (`previews/savory.jpg`, `previews/elsewhere.jpg`, `previews/daily-arc.jpg`, fictional apps). Send them with SendUserFile or attach them, and say they are examples made for other apps, not templates.

Skip a question only when the user already answered it. Ask about the number of screens, story order and brand colors or fonts in the brief (step 3), unless the user already said.

## 2. Collect the truth

- Captures must come from the current build with example or fixture data. If they show real customer data, an older build, or the wrong platform, stop and ask for new ones.
- **Missing platform captures:** never put one platform's captures in another's frame. Hold that target and ask for its captures; if none exist, offer to drop the target. Shotsmith refuses another platform's capture (`capture.crossPlatform`).
- **Fewer captures than screens:** plan phone-less screens (opener, finale, a redrawn chart or card stack) and ask for more captures in the brief checkpoint. Never show one capture twice as two features.
- **Status bars:** check whether the captures include a status bar. Set `captures.<platform>.statusBar` to `"included"` (the kit shows theirs, or paints a clean one over it with `repaint: true`) or `"none"` (the kit draws one). Never two.
- Build the claims table as `claims.json` (step 4): every headline, subline, eyebrow, proof row, card value and label, each with its `source` (the store copy line, or the capture and the element it shows) and its text for every locale. No ratings, awards, press quotes, "#1" or counts you cannot source, **even when the user asks for them**: decline in the brief, say why, and ask for a source (a store listing line, a review count screenshot).
- Imagery must not imply what the product doesn't do (e.g. no hub-to-city arcs when resolver "locations" are services, not probes; no plane routes when the app does not track flights).

## 3. Write a direction brief and get it approved

Before any code, send the user a brief built from their taste and the claims table with exactly these parts:

1. **Direction:** one-line name and the feeling it should give.
2. **Built from:** the user's words and references, and which preset(s) it borrows from, if any (a blend or "new" is fine).
3. **Palette:** hex values, with the role of each.
4. **Type:** display and text fonts with their licenses, per store (see `targets.md`).
5. **Screens:** one line per screen: headline idea, device treatment, overlay or art.
6. **Craft and tech:** each visual element and what renders it (e.g. paper grain: GLSL noise; ornaments: SVG; device shadows: canvas blur; 3D globe: Three.js).
7. **Avoid:** the user's exclusions, restated.
8. **Declined:** requested claims or targets you left out, each with the reason and what would unblock it.

Wait for approval or edits, then save the brief as `brief.md` in the workspace. If copy changes after approval (a headline rewritten to fit), list the change with its source line when you show the next render. Then render the opener for the primary target (steps 4 to 6), show it, and adjust until the user accepts it. Only then build the rest of the set.

## 4. Set up the workspace

Needs Node 20+, npm, and Chromium for Playwright (`npx playwright install chromium`, once per machine); ffmpeg only for video. If headless Chromium cannot run (for example in a sandbox without it), say so, finish steps 1 to 3, show the opener as a live HTML page if the app can display one, and tell the user the full export needs a machine with Node and Chromium (such as Claude Code).

```sh
npx shotsmith@0.1.0 init screenshots --app "Savory"
cd screenshots
```

`init` writes the workspace, installs its dependencies, and adds a sample page and a placeholder capture that `check` refuses until it is replaced. Its `package.json` lists `"shotsmith": "^0.1.0"` (the newest 0.1.x at install time, then held by `package-lock.json`) and `three`.

| Path | Holds |
| --- | --- |
| `shotsmith.config.json` | App, pages in story order, targets, locales, fonts per role and store, status bar per platform, output folder |
| `claims.json` | Every word on the screenshots, its source and its text per locale |
| `brief.md` | The approved direction brief |
| `inputs/<platform>/<locale>/` | Captures; `<platform>` is `iphone`, `ipad`, `android-phone` or `android-tablet` |
| `fonts/` | Open-licence fonts with their license files |
| `pages/` | One HTML page per screen, plus shared modules |
| `out/`, `review/` | Renders and review images (generated, not committed) |
| `export/` | Store-ready JPEGs, contact sheets and `REPORT.md` (committed) |

```json
{
  "app": "Savory",
  "pages": ["01-opener", "02-tonight", "03-recipe", "04-week", "05-saved"],
  "targets": ["iphone-6.9", "android-phone"],
  "locales": [
    { "code": "en", "apple": "en-US", "play": "en-US" },
    { "code": "de", "apple": "de-DE", "play": "de-DE" }
  ],
  "fonts": {
    "display": { "apple": "sysfont:SF-Pro-Display-Bold.otf", "play": "fonts/Inter-Bold.ttf", "fallback": "fonts/Inter-Bold.ttf" },
    "text": { "apple": "sysfont:SF-Pro-Text-Regular.otf", "play": "fonts/Inter-Regular.ttf", "fallback": "fonts/Inter-Regular.ttf" }
  },
  "captures": { "iphone": { "statusBar": "included" }, "android-phone": { "statusBar": "included" } },
  "output": "export"
}
```

```json
{
  "opener.headline": {
    "source": "store-copy: Fresh ideas for your table",
    "text": { "en": "Fresh ideas for your table.", "de": "Frische Ideen für deinen Tisch." }
  }
}
```

- Fonts: SF Pro and New York only through `sysfont:` and only for App Store targets; Shotsmith refuses them for Google Play and never copies them. Give every role a `play` font and a `fallback` for machines without SF (Linux). Each source (`apple`, `play`, `fallback`) can be one file or a weights map: `"play": { "400": "fonts/Inter-Regular.ttf", "700": "fonts/Inter-Bold.ttf" }`.
- Per-locale fonts: `locales[].fonts.<role>` is one source (a file, `sysfont:` or a weights map) that replaces that role for that locale on every store, for example an Arabic face: `{ "code": "ar", "dir": "rtl", "fonts": { "text": "fonts/NotoSansArabic-Regular.ttf" } }`. If it names a missing `sysfont:`, the role's global `fallback` is used, so prefer a bundled file that covers the script.
- After adding a package (`gsap`, `@fontsource/<family>`), run `npm install` and keep `package-lock.json`.

Read `kit.md` before writing pages: it is the full reference for the kit and for what the checks cannot see. A page in short:

```html
<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<script type="module">
import { stage, t, headline, device, lift, ready } from "shotsmith/kit";
const s = await stage();                 // 1260 logical px wide, s.H tall; build inside s.root
s.root.style.background = "#fbf1e3";
const eyebrow = t.el("div", "opener.eyebrow", s.root);
eyebrow.style.cssText = "position:absolute;left:90px;top:160px;font:700 34px var(--font-text);letter-spacing:4px";
const title = document.createElement("div");
title.style.cssText = "position:absolute;left:90px;top:220px;width:1080px;font-family:var(--font-display);font-weight:700";
s.root.appendChild(title);
const fit = await headline(title, "opener.headline", { maxSize: 120, maxLines: 2 });
const phone = await device({ capture: "home", x: 230, y: fit.bottom + 90, width: s.pick({ tall: 800, p916: 620 }) });
lift(phone, { region: [72, 565, 1098, 1337], radius: 64 });   // capture px, measured from the capture
await ready();
</script>
</body></html>
```

- `s.pick({ tall, p916, t43, t916 })` returns the value for the target's form factor; Android and iPad need their own layout, not scaled iPhone art.
- Words only through `t()`, `t.el()` and `headline()`. `shotsmith claims` fails on any visible word that is not a claim, and on a claim element that shows other text. Decorative symbols go in CSS `content` or list markers (see `kit.md`).
- `capture(name)` loads a capture for page art without a frame, such as rows cropped onto canvases.
- Shared code goes in `pages/*.js`, imported with `./`. The render server provides `shotsmith/kit`, `three` and `gsap` through an import map; do not write your own, and never set `window.__ready` yourself.
- Start from the closest complete example in `reference/examples/` (`reference/examples/savory`: custom editorial direction; `reference/examples/elsewhere`: panorama with Three.js; `reference/examples/daily-arc`: flat bold blocks and phone-less card stacks). Each has its config, claims in two locales, brief, store copy and pages. Reuse art from the DNS Kit folders through `reference/README.md`.

## 5. Use the right tech

- **Three.js** for anything 3D: devices, globes, terrain, towers, 3D icons and rings (`shotsmith/kit/three` has a 3D phone and a page-aligned camera).
- **GLSL fragment shaders** for atmosphere: fields, light, rings, fog, with grain and dither.
- **SVG/Canvas2D** for icons, lines, maps and data-viz.
- **GSAP** timelines for motion; each still is its timeline's last frame.
- **HTML/CSS** for typography.

Pick the tech per element of the approved brief. Quiet directions still get craft from code: procedural paper grain or soft light in GLSL/canvas, vector ornaments in SVG, layered shadows. A user exclusion ("no 3D", "no neon") overrides a preset's default tech. A plain CSS gradient behind a phone is never the whole design.

## 6. Review loop

```sh
npx shotsmith render 01-opener -t iphone-6.9 -l en    # out/en/iphone-6.9/01-opener.png
npx shotsmith claims                                  # untraced words and claim mismatches in the renders so far
npx shotsmith build -t iphone-6.9 -l en               # every page for one target and locale, with the checks
npx shotsmith thumbs iphone-6.9 --width 700           # review/en-iphone-6.9-700.png: per-screen critique
npx shotsmith thumbs iphone-6.9 --width 300           # the whole set at listing size
npx shotsmith strip iphone-6.9 -l en                  # panoramas: joins the screens, checks every seam; once per target and locale
```

Render, view it at 700 px wide and in full-size crops of the details, critique like a harsh art director, fix. At least 3 rounds per screen, then review the whole set at 300. Fix every finding `build` reports. The checks catch text overflow, clipping, text in the top or bottom 4%, missing glyphs, fonts not allowed on a store, untraced text and wrong captures; they do not look at the pixels, so look yourself. Every screen passes when:

- each graphic reads at a glance as what it stands for: ask what a stranger would call it at 300 px (a progress arc that looks like loose blobs fails);
- no UI row appears twice: a lifted card covers exactly the region it came from, or leaves an empty recess on a tilted phone; check at full size;
- no card covers capture text it does not replace; lift regions and radii are measured from the capture's pixels (method in `kit.md`, lift); no UI is half cut at a crop edge;
- text is legible at thumbnail size; large text has at least 3:1 contrast, small text 4.5:1;
- no blown whites, banding, aliasing, invisible or hard-edged shadows; texture and grain stay off the phone screens;
- across the set, headlines start at the same height and inner headlines share a size; neighbouring screens differ in layout and hue;
- every locale works: review each one (`-l de`); when a translation shrinks a headline below 80% (`text.shrink`), shorten the translation or re-lay out;
- panoramas: `strip` reports every seam continuous for every target and locale, and no device face, headline or card crosses a seam;
- every claim's `source` is real.

## 7. Export and hand off

`npx shotsmith build` renders every page for every target and locale, writes `export/<locale>/<target>/<page>.jpg` (exact size, opaque, baseline JPEG q92, 4:4:4), contact sheets and `export/REPORT.md`, and runs every check. Do not hand off a set unless it exits 0. Prove it reproduces from a clean tree: `rm -rf node_modules out && npm ci && npx shotsmith build`. Commit the workspace with `export/`, not `out/`, `review/` or `node_modules/`.

Upload only when the user asks. If `npx shotsmith --help` lists an `upload` command, run it without `--apply` first, show the user the plan, and run `--apply` or `--commit` only after they confirm. Otherwise hand over `export/` with the upload notes in `targets.md`. Never submit an app for review.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Reusing old captures with real domains or stale counts | Ask for current fixture captures; check every number against store copy |
| Every screen is headline + phone + card | Vary: no phone, tilted, cropped, card stack, grid |
| Forcing the user's described look into the nearest preset | Write a direction brief from their words; presets are starting points |
| Building the whole set before the user has seen anything | Approve the brief, then the opener, then build the rest |
| Writing words straight into the page | Every word is a claim: `t.el()`, `headline()` |
| Copying frames, headline fit or `__ready` from `reference/` | The kit does these: `device()`, `headline()`, `ready()` |
| Squashing iPhone art to 9:16 for Play | Lay Android out on its own with `s.pick`; Play rejects aspect over 2:1 |
| iPhone capture inside an Android frame | Each platform's captures in its own `inputs/<platform>/` |
| SF Pro on Android images, or SF files in the repo | `play` fonts in the config; `sysfont:` files are never copied |
| Bloom or additive light over white UI | Glow only emissive layers; draw beams solid |
| Guessing map projections, crop boxes or corner radii | Measure from the capture's pixels |
| Placing the subline at a fixed height under a fitted headline | Place what follows from `headline()`'s `bottom` |
| Glows or grain drawn per page in a panorama | Fade them out inside their own screen; run `strip` |
| Changing text after `ready()` | Finish all text first; `render.changedAfterReady` fails the build |
