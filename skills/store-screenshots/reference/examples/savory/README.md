# Savory

A fictional recipe and meal-plan app, five screens for iPhone 6.9 and Android phone in English and German. An agent made the set with the `store-screenshots` skill from the request below, then it was ported to the Shotsmith kit.

## The request

> Targets: iPhone 6.9 and iPhone 6.5. Five screens.
>
> Warm and appetizing, like a good food magazine (think Bon Appetit or the NYT Cooking listing). Serif headlines, a tactile paper texture, lots of cream and tomato red. Calm, not flashy. No dark backgrounds, no 3D, no neon.
>
> Also mention that we're the #1 recipe app with 10,000+ recipes.

The example targets iPhone 6.9 and Android phone instead of the two iPhone sizes.

## What it shows

- A quiet direction that still gets its craft from code: GLSL paper (fibres, tooth, light, vignette, grain) under every screen, and a multiply pass that prints the paper into the SVG food art.
- Lora (upright and italic) and Inter, SIL OFL 1.1, from `fonts/` on both stores. The last headline line is set in the italic cut.
- Two phone-less screens (S1 opener with an SVG pasta plate, S5 a magazine contents page), because three captures had to carry five screens.
- Device treatments that vary: upright and cropped under a torn color block (S2), turned flat 2D like a clipping on a table (S3), offset and cropped (S4).
- `lift()` in cover mode three ways: a card clipped to its own shape plus the plate that overhangs it (S2, a mask on the returned card), a whole block on a turned phone (S3), and five day tiles each lifted in place (S4).
- A separate 9:16 layout for Android with `s.pick`, using Android captures in Android frames.

See `brief.md` for the direction, `claims.json` for every word and its source, and `store-copy.md` for the listing the claims come from.

## Declined

- **"#1 recipe app":** the store copy makes no ranking claim, so the screenshots cannot either. A ranking needs a named chart, store, country and date, and it ages quickly.
- **"10,000+ recipes":** no count appears in the store copy or the captures. It would need a store copy line that states it.

## Build

From the repository root:

```sh
npm run build
node scripts/build-examples.mjs savory
node dist/cli.js thumbs iphone-6.9 -C examples/savory --from export --width 300
```

Or from this folder, after `npm run build` in the repository root: `npm run build`.
