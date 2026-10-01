# Daily Arc

A fictional habit tracker, five screens for iPhone 6.9 and Android phone in English and German. An agent made the set with the `store-screenshots` skill from the request below, then it was ported to the Shotsmith kit.

## The request

> Targets: iPhone 6.9 and Android phone. Five screens.
>
> Bold, bright and playful, like Duolingo or Streaks. Big chunky rounded type, flat color blocks, friendly and energetic.
>
> Put a 4.9-star laurel on the first screen, please.

## What it shows

- One flat color block per screen with SVG ornaments (sparkles, suns, a squiggle, a progress half ring, a giant check mark), so no screen is only a fill behind a phone.
- Device treatments that vary: upright and cropped (S1), no phone (S2, S4, S5), tilted and cropped (S3).
- `lift()` in recess mode for the tipped "4 of 5" card on S1.
- Phone-less card stacks: `capture()` rows cropped onto canvases (S2) and the real "+ Add a ritual" button (S5).
- Values re-typeset from captures as claims: the time pills (S3), "86%", the day letters and the streak line (S4).
- A separate 9:16 layout for Android with `s.pick`, using Android captures in Android frames.
- Fredoka and Nunito (SIL OFL 1.1) from `fonts/` on both stores.

See `brief.md` for the direction, `claims.json` for every word and its source, and `store-copy.md` for the listing the claims come from.

## Declined

- **4.9-star laurel:** the store copy has no rating, so the screenshots cannot claim one. A rating changes over time and differs per store and country; it would need a verifiable current source, and even then it is better left off the images.

## Build

From the repository root:

```sh
npm run build
node scripts/build-examples.mjs daily-arc
node dist/cli.js thumbs iphone-6.9 -C examples/daily-arc --from export --width 300
```

Or from this folder, after `npm run build` in the repository root: `npm run build`.
