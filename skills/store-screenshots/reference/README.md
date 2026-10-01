# Reference code

Building blocks from the DNS Kit set, one folder per style in `styles.md`. They were written before the Shotsmith kit, so each folder carries its own frames, sizing and readiness code. Take the art from them; take everything rule-bound from the kit.

## Complete examples

`examples/` holds three complete workspaces built with the kit: `savory`, `elsewhere` and `daily-arc`. Each has `shotsmith.config.json`, `claims.json` (English and German), `brief.md` with what was declined, `store-copy.md` and `pages/`. Captures and fonts are not copied here; the pages show how the kit is used, and are the best starting point for a new set. The examples' README "Build" sections are for the shotsmith repository; in your workspace use `npx shotsmith build`. Elsewhere also needs `three`, which `init` already adds.

## What the kit replaces

| In these files | Use instead |
| --- | --- |
| Per-target sizes, scale and `setup()` | `stage()` and `s.pick()` |
| Phone frames, `deviceScreen()`, status bars, home indicators | `device()` (and `phone3d()` in `shotsmith/kit/three`) |
| Lifted cards over a phone | `lift()` |
| Crops of a capture without a phone | `capture()` and your own canvas |
| Headline fit | `headline()` |
| Hard-coded text | `t()` and `t.el()` with `claims.json` |
| Fonts from `/sysfont/` in CSS | `fonts` in `shotsmith.config.json`, used as `var(--font-<role>)` |
| `window.__ready` | `ready()` |
| `<script type="importmap">` | Nothing: the render server injects one for `shotsmith/kit`, `three` and `gsap` |

The copy, capture names, crop boxes and map data in these folders are DNS Kit's; never reuse them.

## Per folder: what is worth taking

- **cinematic/**: `scene3d.js` (contour terrain, dotted globe from a land mask), glass cards and pills in `system.js`, the lattice tower in `04-monitors.html`, the icon grid in `08-more.html`.
- **three-studio/**: lighting, soft shadow planes, 3D icons and supersampling in `lib.js`; `globe.js` (needs an equirectangular land mask image, white land on black water, for example rasterized from Natural Earth, which is public domain).
- **glsl-shader/**: the fields, grain and dither in `common.js`; the glass lens in `screen1.html`; the shader globe in `screen3.html`.
- **svg-gsap/**: ring arcs and card styling in `lib.js`; the timeline pattern in `preview.html` (each still is the timeline's last frame, and the same timeline records a motion draft through `window.__seek`; App Preview export is not supported in this version); `mapdata.py` shows how to sample a map capture into dots, but its colors and bounds are for one specific map.
- **panorama/**: `strip.html` draws all screens as one wide scene. To ship it, render one page per screen that draws the same scene offset by its index: `camera.setViewOffset(W * n, H, W * i, 0, W, H)` for Three.js, an offset uniform in strip coordinates for shaders. Check the seams with `npx shotsmith strip <target>`.
