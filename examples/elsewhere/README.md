# Elsewhere

A fictional trip planner, five screens for iPhone 6.9 and Android phone in English and German that join into one panorama. An agent made the set with the `store-screenshots` skill from the request below, then it was ported to the Shotsmith kit.

## The request

> Targets: iPhone 6.9 and iPhone 6.5. Five screens.
>
> Dreamy and cinematic, a golden-hour travel feeling, like a postcard at dusk. I'd love the screens to connect into one continuous panorama as you scroll the listing. 3D is welcome.
>
> Please say it works offline and has live flight tracking.

The example targets iPhone 6.9 and Android phone instead of the two iPhone sizes.

## What it shows

- A panorama built as one page per screen: a GLSL coastline evaluated in strip coordinates with each screen's offset, so `shotsmith build` works unchanged and `shotsmith strip` reports every seam continuous for both targets and locales.
- An element that travels across a seam: the opener's postmark waves run on into screen 2 and fade there.
- Three.js on a page: 3D enamel proof tiles through `createRenderer()` from `shotsmith/kit/three`, with a camera set to the screen's place in the strip.
- Device treatments that vary: no phone (S1, S5), upright and cropped (S2), tilted in 3D (S3), lying back on the water (S4).
- `lift()` three ways: cover on the upright phone (S2), recess pushed toward the viewer on a tilted phone (S3), and recess turned upright out of a phone lying back (S4).
- A claim inside inline SVG: the ELSEWHERE wordmark on the postmark ring is SVG `<text>` marked with `data-claim`.
- A separate 9:16 panorama for Android with `s.pick`, using Android captures in Android frames.
- Fraunces (upright and italic) and Inter, SIL OFL 1.1, from `fonts/` on both stores.

See `brief.md` for the direction, `claims.json` for every word and its source, and `store-copy.md` for the listing the claims come from.

## Declined

- **"Works offline":** the store copy does not say it and the captures do not show it, so the screenshots cannot claim it. It needs a store copy line that states it.
- **"Live flight tracking":** not in the store copy or the captures either. The set also avoids flight paths, plane markers and arcs, which would imply tracking without saying it.

## Build

From the repository root:

```sh
npm run build
node scripts/build-examples.mjs elsewhere
node dist/cli.js strip iphone-6.9 -C examples/elsewhere
node dist/cli.js thumbs iphone-6.9 -C examples/elsewhere --from export --width 300
```

`build-examples.mjs` runs `npm ci` here first (the pages need `three`). Or from this folder, after `npm run build` in the repository root and `npm install` here: `npm run build`.
