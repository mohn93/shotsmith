# Screenshot styles

Five tested presets, plus "match a listing" and custom directions built from the user's own words. Presets are starting points: blend them, bend them, or leave them for a custom direction. `previews/<style>.jpg` shows each preset as made for DNS Kit; say so when showing them. Reference code for each is in `reference/<style>/`; reuse the building blocks and replace the content.

| Style | Best for | Mood | Primary tech |
| --- | --- | --- | --- |
| Cinematic (recommended default) | Technical, utility, data, travel, finance apps | Dark, atmospheric, premium | Three.js scenes + GLSL fields + SVG icons + HTML type |
| Three.js studio | Hardware-feel, pro tools, anything that benefits from real 3D devices | Photoreal product shots | Three.js PBR |
| GLSL shader art | Developer tools, AI, audio, security | Dark, luminous, abstract | GLSL fragment shaders + Canvas2D |
| SVG editorial + motion | Consumer, productivity, education, fintech | Bright, flat, bold | SVG/Canvas2D + GSAP (+ motion draft) |
| Panorama | Any app whose story reads as one journey | Continuous strip across screens | Mixed: one Three.js/GLSL scene sliced into screens |

## Cinematic (Flighty-style)

The strongest result so far, and the one that shipped (`previews/cinematic.jpg`). Modeled on Flighty's listing (Apple Design Award).

- **Opener has no phone.** A hero render (violet contour terrain + dotted globe, or another object that stands for the product), a big left-aligned headline, an accent-colored second line ("Debug smarter."), and two proof rows at the bottom with 3D icon tiles. Proof rows are facts from the store copy ("37 resolver endpoints", "7 record types"), never awards the app doesn't have.
- **Eyebrows:** small outlined uppercase pills above the headline; one solid pill for the paid tier or a live feature.
- **Headlines:** bold, title case, 5 words or fewer; left-aligned on the opener, centered on inner screens; muted gray two-line subline taken from the store description.
- **Color:** near-black base with one strong mood per screen, never the same hue twice in a row (violet, magenta, red fog, teal, navy, purple).
- **Phones:** large, cropped off an edge, some tilted in 3D. Vary the treatment: upright, tilted, cropped left, none.
- **Glass cards:** dark translucent cards (opaque when the phone is tilted, or rows show through) that re-typeset values from the same capture and cover exactly the region they replace.
- **Problem screen:** one red-fog screen with a 3D object (a lattice tower worked) and an alert-card stack, for monitoring, alerts or errors.
- **Finale:** "All this. In one app." with a two-column grid of line icons and labels, only for features that exist.
- **Tech:** Three.js for terrain (contour shader), dotted globe (land mask sampled from an image), tower (instanced lattice members, fog, rim light, beacon glows without bloom); canvas/GLSL background fields with grain; SVG icons; HTML/CSS typography.
- **Reference:** `reference/cinematic/system.js` (glass cards and pills; its frames, fonts and headline fit are replaced by the kit), `scene3d.js` (terrain, globe, land mask), `01-opener.html`, `03-email.html`, `04-monitors.html` (tower), `08-more.html` (grid).

## Three.js studio

- Procedural modern phone: rounded extruded body, `MeshPhysicalMaterial` metal frame, glass front, capture texture in sRGB with anisotropic filtering. `RoomEnvironment` + PMREM for reflections.
- Floating 3D UI: an extruded score ring, 3D check and warning icons, cards lifted from the capture with soft shadows.
- Dotted globe with glowing pins and arcs when geography is real (see truth rules in SKILL.md).
- Render at 2x and downscale for crisp UI text.
- **Known failures:** bloom pushes white UI into a white blob (bloom only an emissive layer, or none); shadows first invisible, then hard rectangles (blurred shadow plane); black frame reads as plastic (tune roughness and env intensity); one bad glow value blanks regions with white blocks.
- **Reference:** `reference/three-studio/lib.js` (lighting, shadows, icons, supersampling; for the phone itself use `phone3d()` from `shotsmith/kit/three`), `globe.js`, `screen2.html`.

## GLSL shader art

- Fragment-shader atmosphere: domain-warped fbm fields, signal rings radiating from a hero element, wave ribbons, light rays, a shader dotted globe. Always add grain and dithering against banding.
- Glass lens refracting a hero number (chromatic fringe, frosted rim); a scan beam sweeping a card.
- Thin-bezel device drawn in Canvas2D over the shader; HTML type on top.
- **Known failures:** first aurora and silk attempts looked like streaks and contour lines (start from the tested fields in `common.js`); additive light is invisible over white UI (draw a solid beam); the lens hid the text under it; most of the shader sits behind the phone, so design the visible top 25% and the edges on purpose.
- **Reference:** `reference/glsl-shader/common.js`, `screen1.html` (lens), `screen3.html` (shader globe).

## SVG editorial + GSAP motion

- One bold flat color block per screen (e.g. blue, yellow, green), big left-aligned headline, vector device frame, cards popped out of the capture with status badges, oversized numerals, a dotted world map sampled from map pixels.
- Build every screen as a paused GSAP timeline; the still is the last frame, and the same timeline records a motion draft through `window.__seek` (`npx shotsmith render <page> -t <target> --video`, at the screenshot target's size). App Preview export is not supported in this version, so the draft is for reviewing motion only.
- **Known failures:** every screen fell into headline + phone + pop-out card; a weak illustration (an "@" glyph) looked like clip art, so drop art that doesn't land; the overlay font differed from the capture's font during the counter animation; thousands of SVG nodes made frames take 4.8 s (canvas dots brought it to 0.45 s).
- **Reference:** `reference/svg-gsap/lib.js` (frame, card lifting, ring arcs), `scenes.js`, `preview.html` (video timeline), `mapdata.py` (map sampling). Video frames: `previews/svg-gsap-video-frames.jpg`.
- **Example:** `reference/examples/daily-arc` (flat color blocks, phone-less card stacks, no motion).

## Panorama

- One continuous scene across N screens, plus one element that travels across seams (a light cable, a path, a coastline, a globe straddling a seam on purpose). Render it as one page per screen, each drawing the shared scene offset by its index (`camera.setViewOffset` in Three.js, an offset uniform in shaders), so `shotsmith build` works unchanged; `reference/panorama/strip.html` shows the scene as one wide page.
- Each screen must work alone: no headline, device face or card cut by a seam. A phone "cropped off the edge" is cut by a seam, so choose another treatment.
- Check with `npx shotsmith strip <target>`: it joins the screens and flags seam steps down the full height. Per-page glows and shadows are the usual cause.
- **Known failures:** the globe hid behind a phone; a card duplicated content under it; the cable ran straight down a seam; poses repeated on every screen; phone glows made brightness steps at seams; headlines sat at different heights, visible only in the joined strip.
- **Reference:** `reference/panorama/strip.html`.
- **Example:** `reference/examples/elsewhere` (five-screen golden-hour panorama, iPhone and Android).

## Match a listing

When the user names an app whose listing they admire:

1. Read its screenshots at full size: from the store page when you have web access, or images the user sends. If none of these is available, say so in the brief and describe the language from memory, marked as such.
2. Write down its DNA as bullets: opener treatment, eyebrow/headline/subline system, color per screen, device treatment and crops, overlay cards, the "problem" screen, the finale.
3. Emulate the language with the app's own captures and claims. Never copy the reference's assets, text, quotes or awards.
4. Deliver a side-by-side `compare.png` (reference row over your row) with the set.

## Custom direction from the user's words

Translate every taste word into a concrete decision in the direction brief (SKILL.md step 3), and keep the user's words next to each decision so they can see how they were read.

| The user says | Decide |
| --- | --- |
| A mood ("calm", "bold", "playful", "premium", "technical") | Light and contrast, color saturation, amount of empty space, motion energy |
| Apps they like ("like Things 3", "like Duolingo") | Study those listings as in "Match a listing"; take the language, not the assets |
| Colors ("terracotta and sage", "our brand blue") | Palette with hex values and roles: base, surface, accent, text, status |
| Type ("serif", "rounded", "condensed") | Specific licensed fonts for display and text, per store (`targets.md`) |
| Textures ("paper", "grain", "glass", "fabric") | Procedural texture in GLSL or canvas (noise, fibers, light falloff), never a stock photo |
| Exclusions ("no 3D", "no neon", "no dark mode") | Remove those tools and treatments even if a preset uses them; restate them in the brief |

Example: "calm, warm, bookish, like Things 3 or Day One, paper texture, serif headline, terracotta and sage, no 3D, no dark mode" becomes a light editorial direction. Warm off-white paper made from GLSL fiber noise with soft vignetting; a licensed serif display (e.g. an OFL serif) over a humanist sans; terracotta accent and sage secondary on neutral text; phones upright or gently cropped with layered soft shadows; small SVG ornaments (rules, marginal notes) instead of 3D; generous margins; one idea per screen. It borrows the one-idea-per-screen structure from Cinematic and the flat framing from SVG editorial, and drops Three.js because of "no 3D".

The Savory example (`reference/examples/savory`) was built from a request like this: warm food magazine, serif headlines, paper texture, cream and tomato, no dark backgrounds, no 3D.
