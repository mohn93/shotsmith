# Daily Arc: direction brief

Approved trial brief ("Bright Streak"), updated for the Shotsmith port: targets iPhone 6.9 and Android phone, locales English and German, Fredoka and Nunito from `fonts/` on both stores. Every word on the screenshots is in `claims.json` with its source.

1. **Direction:** "Bright Streak". Loud, sunny, friendly: every screen feels like a small win being celebrated.
2. **Built from:** the user's words "bold, bright and playful, like Duolingo or Streaks, big chunky rounded type, flat color blocks, friendly and energetic". Borrows SVG editorial (one flat color block per screen, big headline, cards popped out of the capture) and Cinematic's rule of varying the device treatment and ending on a feature grid. Duolingo and Streaks were not studied pixel by pixel; we take the language only (chunky rounded type, saturated solid fields, flat "3D button" offset shadows, big friendly check marks), never their assets or mascots, and we do not invent a mascot.
3. **Palette:**
   - Blocks, one per screen, never repeated in a row: Sunshine `#FFC83D` (S1), Sprout `#34C38F` (S2), Peach `#FF8B5E` (S3), Sky `#4D8DF7` (S4), Grape `#8C6CF2` (S5).
   - Block shades (flat offset shadows, ornaments): `#E9A21C`, `#27A878`, `#F07544`, `#3572DB`, `#6E4FD8`.
   - Ink `#172B34` (from the app): headlines on Sunshine, Sprout, Peach.
   - White `#FFFFFF`: headlines on Sky and Grape; card surfaces.
   - Brand green `#278875` (from the app): arc fill, check badges, time pills. Deep green `#1C6456`: chunky edge under green elements.
   - Mint `#DCEEE7` (from the app): empty arc segment.
4. **Type:** Fredoka 500/600/700 (SIL OFL 1.1) for display; Nunito 600 to 900 (SIL OFL 1.1) for sublines, chips and card text. The same files on the App Store and Google Play (`fonts/`, woff2 from @fontsource with their OFL texts), so no SF Pro anywhere.
5. **Screens:**
   - S1 (Sunshine) "A little progress adds up.": headline top left with a green squiggle under its last line; upright phone with the home capture, cropped by the bottom edge; a 5-step half ring (4 green, 1 mint, a check knob) behind the phone top; the "4 of 5" card lifted and tipped over its own region, which is filled with the capture background; sun and sparkles.
   - S2 (Sprout) "Check them off as you go.": no phone; the three ritual rows from the home capture as a tilted card stack, check badges over the two done rows, the open one waiting, a giant flat check mark behind.
   - S3 (Peach) "Plan your rituals with times.": phone tilted 6 degrees and cropped right; the three times (07:30, 08:00, 12:30) as big bubble pills over the capture's own labels, popping out to the left.
   - S4 (Sky) "Track your week.": no phone; giant "86%" numeral with the capture's "THIS WEEK" and "completion", the 7-day bars redrawn as chunky rounded SVG bars at measured heights, the capture's reading streak line as a chip.
   - S5 (Grape) "Add a ritual, anytime.": the real "+ Add a ritual" button cropped from the rituals capture, and a finale grid of six icon tiles for features in the store copy.
   - Android phone: each screen re-laid out for 9:16 with `s.pick` (smaller headline, smaller or repositioned phones and cards), never the iPhone layout squashed.
6. **Craft and tech:**
   - Color blocks: flat CSS fill plus SVG ornaments (sparkles, suns, squiggles, confetti dots) in the block shades.
   - Arc, squiggle, check badges, bars, icons: SVG with round caps and chunky strokes.
   - Device frames: the kit's `device()` for each platform, with the capture's status bar repainted as a clean 9:41 bar; a flat offset "block" in the screen's shade under each frame.
   - Lifted card: the kit's `lift()` in recess mode, tipped -2.5 degrees with a mint edge.
   - Card stack and button: `capture()` cropped onto canvases.
   - Type: HTML/CSS; headlines fitted by the kit's `headline()`, everything below placed from its bottom.
   - No 3D, no GLSL, no motion: the look is flat on purpose.
7. **Avoid:** no star rating or laurel, no awards or counts; no dark cinematic mood, no gradients as the main idea, no thin or condensed type; no mascot or Duolingo/Streaks assets; nothing implying reminders, sync or social features the store copy does not claim.
8. **Declined:**
   - The 4.9-star laurel on screen 1: the store copy has no rating, and a rating changes and differs per store. It would need a verifiable current rating with its store and country; even then we recommend leaving it off the screenshots.
   - Not sourced, so not used: star ratings, "#1", user counts, press quotes, reminders or notifications, widgets, sync, Apple Health, social features.
