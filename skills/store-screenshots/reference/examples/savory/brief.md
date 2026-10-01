# Savory: direction brief

Approved trial brief ("Sunday Supplement"), updated for the Shotsmith port: targets iPhone 6.9 and Android phone, locales English and German, Lora and Inter from `fonts/` on both stores. Every word on the screenshots is in `claims.json` with its source.

1. **Direction:** "Sunday Supplement". A warm food-magazine spread: cream paper, tomato red, a confident serif. It should feel calm and appetizing, like opening the weekend food section, not like an ad.
2. **Built from:** the user's words "warm and appetizing", "good food magazine", "Bon Appetit or NYT Cooking listing", "serif headlines", "tactile paper texture", "lots of cream and tomato red", "calm, not flashy". Borrows the one-idea-per-screen rhythm and a phone-less opener from Cinematic, flat framing and bold color blocks from SVG editorial, and the paper direction in `styles.md`. Otherwise new. NYT Cooking and Bon Appetit listings were not studied pixel by pixel; we take the language only, never their assets.
3. **Palette** (sampled from the captures so the art matches the app):
   - `#FCF3E4` paper cream: base of screens 1, 2 and 5 (a shade warmer than the app's `#FFF8F0`, so screens separate from paper).
   - `#E45D3F` tomato: the app's brand red. Accent headline lines on cream, rules, ribbon, the screen 2 color block.
   - `#C73D2D` deep tomato: accent headline lines on butter and sage, the contents numbers, tomato halves.
   - `#B83A2A` folio red: eyebrows and folios (at least 4.5:1 on every field).
   - `#3F2924` espresso ink: headlines and row titles (the app's text color). Not a background.
   - `#7A5E54` cocoa: sublines and row detail (at least 4.5:1 on every field).
   - `#F8E3C0` butter: screen 3 field. `#E9EDDA` sage and `#4E955E` basil: screen 4 field and leaves.
   - Per-screen mood, no two neighbours alike: 1 cream and the plate, 2 tomato block, 3 butter, 4 sage, 5 cream and the ribbon.
4. **Type:** Lora (SIL OFL 1.1, variable, upright and italic) for display, set at 600, with the last headline line in the italic cut; Inter (SIL OFL 1.1) 400 and 700 for sublines, folios, eyebrows and rows. The same files on the App Store and Google Play (`fonts/`, with their OFL texts), so no SF Pro anywhere. Eyebrows are Inter 700, uppercase and tracked, like a magazine folio.
5. **Screens:**
   - S1 opener, no phone: masthead rules with the "Savory" and "Recipes & Meal Plan" folios, big serif "Fresh ideas / for your table.", the subline, a large overhead pasta plate bleeding off the right edge with loose basil and tomatoes, two proof rows with icon medallions at the bottom.
   - S2 "Tonight's dinner, in seconds.": tomato block across the top with a torn lower edge; phone upright, large, cropped at the bottom between the tab bar's divider and its icons; the Tonight's pick card lifted over its own region together with the plate that overhangs it.
   - S3 "Everything you'll need.": butter field; phone turned a few degrees (flat, 2D, like a clipping on a table) and cropped off the left; the chips, "What you'll need" and the ingredients card lifted over their region; a lemon half and a basil sprig off the right edge.
   - S4 "Lunch and dinner, any day.": sage field; phone offset right and cropped below "+ Add a meal"; the five day tiles lifted; the roasted pepper bowl tucked under the phone off the left edge.
   - S5 "Save the ones you love.": no phone; a bookmark ribbon with a heart; a magazine contents page of seven features from the store copy, numbered, with line icons; a basil sprig at the foot.
   - Android phone: each screen re-laid out for 9:16 with `s.pick` (smaller headlines, phones and plate, tighter rows), never the iPhone layout squashed.
6. **Craft and tech:**
   - Paper: GLSL fragment shader (stretched fbm fibres, fine tooth, soft top-left light falloff, warm vignette, grain and dither against banding), plus a multiply pass that prints the fibres into the art. Both stay below the phones: glass carries no paper.
   - Plate, pasta, tomatoes, basil, lemon, pepper bowl, ribbon, icons: SVG, in the app's flat illustration style, with soft warm blur shadows.
   - Devices: the kit's `device()` for each platform, status bar repainted as a clean 9:41 bar, with a warm layered shadow in place of the kit's black one.
   - Lifted cards: the kit's `lift()` in cover mode; on S2 the card is clipped to the card and its overhanging plate with a mask.
   - Type: HTML/CSS; headlines fitted by the kit's `headline()`, everything below placed from its bottom.
7. **Avoid:** dark backgrounds, 3D (no Three.js, no 3D icon tiles), neon or glow, flashy effects, and the unsourced "#1" and "10,000+" claims.
8. **Declined:**
   - "#1 recipe app": not in the store copy; a ranking needs a source (a named chart, store, country and date). Even with one it ages fast.
   - "10,000+ recipes": no count appears in the store copy or the captures. Not used anywhere, including the proof rows and the contents page. It needs a store copy line that states it.
   - Not sourced, so not used: star ratings, awards, press quotes, rankings, user or recipe counts.
