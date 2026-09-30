# Shotsmith kit

The kit is the browser library a page imports to lay out one screenshot. Pages live in `pages/<page>.html`, and Shotsmith renders each one in headless Chromium for every target and locale.

```html
<script type="module">
import { stage, headline, device, lift, ready } from "shotsmith/kit";
const s = await stage();
// ...build the page inside s.root...
await ready();
</script>
```

`three` (for `shotsmith/kit/three`) and `gsap` are resolved from the workspace's `node_modules`.

## Stage

`await stage()` loads the locale's fonts, claims and captures and returns the stage.

- The logical stage is always 1260 px wide, for every target. Lay out in these logical pixels; CSS sizes on the page are logical px.
- `s.scale` is `target.w / 1260`. The stage element is scaled by it, so a 1290 px target renders at 1.0238 and the exported image is exactly the target size.
- `s.W` is 1260 and `s.H` is the logical height, `round(target.h / scale)`.
- `s.root` is the element to build in. Set its background here. Other members: `target`, `platform`, `store`, `locale`, `dir`, `formFactor`.
- Fonts are available as `var(--font-<role>)`, for example `var(--font-display)` and `var(--font-text)`, for the roles in `shotsmith.config.json`.

### pick

`s.pick({ tall, p916, t43, t916 })` returns the value for the target's form factor, and the `tall` value when the target's key is missing. `tall` is required.

| Key | Built-in targets | Rule for custom targets |
| --- | --- | --- |
| `tall` | `iphone-6.9`, `iphone-6.5` | long side / short side at least 2.1 |
| `p916` | `android-phone` | about 16:9 phone, under 2.1 |
| `t43` | `ipad-13` | ratio under 1.5 |
| `t916` | `android-tablet` | about 16:9 tablet, under 2.1 |

A custom target can set `formFactor` in the config instead of relying on the ratio.

## Text and claims

Every word on a screenshot must come from `claims.json`, and every claim needs a `source` (the store copy line or capture it comes from) and text for every configured locale.

- `t(id)` returns the claim's text for the current locale and throws for an unknown id.
- `t.el(tag, id, parent?)` creates an element with that text and `data-claim="<id>"`, and appends it to `parent` when given.
- Any element with `data-claim` is a claim element. `headline()` sets it for you.

`shotsmith claims` (and `check`/`build`) require:

- Exact match per claim element: the text the element visibly shows must equal the claim text for that locale. Whitespace and line breaks are ignored; everything else must match. Text the claim element does not show, or extra text inside it, is a `claims.mismatch`.
- Text outside any claim element is `claims.untraced`, except kit chrome (the status bar the kit draws).
- Text that is not in the DOM as text is untraced and fails: text drawn by CSS `content` (`::before`/`::after`), list counters and markers, canvas text, text inside frames, form fields, SVG images, and the alt text browsers show for an image that does not draw. Numbered lists must put the numbers in claim text and use `list-style: none`.
- Punctuation and symbols alone are allowed as decoration: bullets, check marks, quote marks, arrows.
- Unused claims are a warning (`claims.unused`). A page that never calls the kit fails (`kit.unused`).

Two more rules the checks enforce:

- A page must not change its text after `ready()`. The renderer compares the page text before and after the screenshot and reports `render.changedAfterReady`.
- Fonts for Google Play targets must not be Apple's SF or New York, from any source: config, a workspace font file, a page `@font-face`, or a system fallback. Name a Play font in `fonts.<role>.play` and a non-Apple `fallback`. A page that uses a font the configured files do not cover gets `text.coverage`.

## headline

```js
const r = await headline(el, "opener.headline", { maxSize: 110, minSize: 66, maxLines: 2, lineHeight: 1.08 });
```

Fills `el` with the claim, marks it as a claim element, and picks the largest font size from `maxSize` down to `minSize` (default 60% of `maxSize`, 0.5 px steps) where the text fits in at most `maxLines` (default 2) lines and no word overflows the box. Give `el` a width first; `headline` sets `font-size` and `line-height` only.

Returns `{ size, lines, shrink, bottom, overflow }`:

- `size` is the chosen font size in logical px, `lines` the line count.
- `shrink` is `size / maxSize`. Below 0.8 the check warns (`text.shrink`).
- `bottom` is the bottom edge of the element in logical px, for placing what follows.
- `overflow` is true when nothing down to `minSize` fits; `check` then reports `text.overflow`.

Do not put the element inside a rotated or scaled container: the measurement would be wrong. Keep headlines in unrotated containers and rotate other elements instead.

## device

```js
const d = await device({ capture: "home", x: 180, y: 260, width: 900 });
```

Draws a phone or tablet frame around a capture, in the frame style of the target's platform.

| Option | Meaning |
| --- | --- |
| `capture` | Capture name, the file name without extension. |
| `x`, `y` | Top-left of the screen (not the frame) in logical px. The bezel extends outside this point. |
| `width` | Width of the screen in logical px. The height follows the capture's aspect ratio. |
| `tilt` | A number of degrees (`perspective(4000px) rotateY(deg)`), or any CSS `transform` string. |
| `repaint` | With `statusBar: "included"`, repaint the capture's status bar band with a clean 9:41 bar. |
| `homeIndicator` | Add the home indicator band below a capture that has none. |
| `shadow` | Drop shadow under the frame (default true). |
| `finish` | `"graphite"` (default) or `"silver"`. |
| `z`, `parent` | z-index, and the element to append to (default the stage root). |

Status bar modes are set per platform in the config, `captures.<platform>.statusBar`:

- `"included"`: the capture already contains the status bar. It is shown as is, or repainted with `repaint`.
- `"none"` (the default): the capture has no status bar. The kit adds a status band above it and a home indicator band below it, so the screen is taller than the capture.

`captures.<platform>.pointWidth` gives the capture's width in points when the chrome should be scaled for it; by default iPhone captures are 3x, iPad 2x, and Android phones 411 pt wide, Android tablets 800 pt wide.

Returned: `el` (the frame element), `screen`, `image`, `k` (logical px per capture px), `toStage(cx, cy)` (capture px to stage px), `toLocal(cx, cy)` (capture px to px inside the frame, used with `tilt`), `pixel(cx, cy)` (the capture's color at a point as `rgb(...)`), and `tilted`.

### Capture folders and fallback

Captures live in `inputs/<platform>/<locale>/<name>.png` (`.jpg`/`.webp` also work), where `<platform>` is `iphone`, `ipad`, `android-phone` or `android-tablet`. Lookup order for a capture name:

1. `inputs/<platform>/<locale>/`
2. `inputs/<platform>/<default locale>/` (the first locale in the config). Using it is a warning, `capture.fallback`.
3. `inputs/<platform>/` directly.

Captures never fall back across platforms: an iPhone target never reads `inputs/android-phone/`. The renderer records every capture a page requests, and loading another platform's capture is an error (`capture.crossPlatform`), even if the page loads it by hand. A platform with targets and no captures is `capture.platform`.

`shotsmith init` writes a placeholder capture at `inputs/iphone/en/home.png`. Until you replace it, `check` fails with `capture.placeholder`.

## lift

```js
lift(d, { region: [90, 600, 1080, 900] });
```

Lifts one row of a capture (a card, a notification) out of the device as a floating card. `region` is `[x0, y0, x1, y1]` in capture pixels.

Measure it: open the capture in an image viewer and read the row's pixel bounds; the region should sit just inside the card's outer edge. Measure `radius` the same way, as the card's corner radius in capture pixels. It defaults to `min(28, height / 2)`, which is rarely exactly right, and a wrong radius shows as a sliver of the source corner.

| Option | Meaning |
| --- | --- |
| `mode` | `"cover"` or `"recess"`. Default `"cover"` on a flat device, `"recess"` on a tilted one. |
| `scale` | Size of the card relative to the region (default 1.08). |
| `radius` | Corner radius in capture px. |
| `inset` | Pixels trimmed from the region's edges before cropping (default 2). |
| `at` | Where the card's center goes. Flat: stage px. Tilted: px inside the frame, from `d.toLocal`. |
| `shadow` | CSS `box-shadow` for the card. |
| `z` | z-index of the card (default 30). |

- `cover`: the card sits over its own row and hides it, so it cannot move (`at` is refused) and must not shrink (`scale >= 1`). Use it for a small lift in place.
- `recess`: the row is replaced by a flat patch filled with the capture's background, sampled beside the region (left of it when the region starts at x >= 8, otherwise right, otherwise above), and the card goes to `at`. The patch has no shadow; if the capture has a gradient or image behind the row the patch will show, so pick regions over plain backgrounds.
- On a tilted device the card is a child of the frame, 2 px in front of the screen, so it follows the tilt without drifting off the patch.

## kit/three

```js
import * as THREE from "three";
import { stage, ready } from "shotsmith/kit";
import { createRenderer, pagePerspective, studioEnvironment, phone3d, at } from "shotsmith/kit/three";
const s = await stage();
const renderer = createRenderer();
const scene = new THREE.Scene();
const phone = await phone3d({ capture: "home", width: 760, renderer, envMap: studioEnvironment(renderer) });
phone.position.copy(at(630, s.H / 2, 0));
phone.rotation.y = -0.35;
scene.add(phone);
renderer.render(scene, pagePerspective());
await ready();
```

Needs `three` (0.160 or newer) in the workspace's `node_modules` (`npm install three`); `init` adds it to `package.json`. World units are logical stage px with `at(x, y, z)` mapping stage coordinates (y down) into the scene. `phone3d` builds a phone with the capture as its screen and supports phone targets only (`iphone`, `android-phone`). Render once before `ready()`; the renderer keeps its drawing buffer so the screenshot shows it. The capture rules above apply to `phone3d` too.

## ready

`await ready()` goes last. It waits for fonts, images and pending kit work, then records what the checks need: every visible text and its box, claim elements, generated content, fonts, captures, devices and lifts. A page that throws or never reaches `ready()` fails the render. After `ready()` the page must not change text or draw text on a canvas.

## Output and build

- `shotsmith render` writes `out/<locale>/<target>/<page>.png` and a `.sidecar.json` next to it.
- `shotsmith build` renders everything, writes JPEGs to `export/<locale>/<target>/<page>.jpg` (exact target size, opaque RGB, baseline JPEG, quality 92, chroma 4:4:4), contact sheets and `REPORT.md`, and runs every check.
- The export folder (`output` in the config) must be a real folder inside the workspace. Links are refused (`store.linked`), and Shotsmith never writes or deletes through one.
- Anything in the export folder that is not an export of a configured locale, target and page is a stale file and an error (`store.stale`). `build` deletes stale images and then folders of removed locales and targets that are left empty; other stale files it only reports.

## What the checks cannot see

The checks read the rendered DOM, canvas calls and served files. They do not read the pixels of the final image, so they cannot see:

- Raster images of text, such as a PNG of a logo or a slogan. Text that matters must be live text that goes through claims.
- A same-size capture from another platform placed in the wrong folder, for example an Android capture in `inputs/iphone/en/`. The size fits, so nothing flags it.
- Exotic ways of drawing text: `::scroll-marker`, `::scroll-button` and `::picker-icon` content; SVG images used through `pattern`, `use` or `feImage`; canvas text drawn from a worker or through `createImageBitmap`; `fillText` called from another realm; `::first-line` or `::first-letter` color on transparent text; `text-emphasis` marks; and visual reordering of text with CSS.

The checks target honest mistakes, not deliberate evasion. A page written to get around them can, and they are not a substitute for looking at the exported images and thumbnails (`shotsmith thumbs`).
