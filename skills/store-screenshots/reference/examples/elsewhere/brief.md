# Elsewhere: direction brief

Approved trial brief ("Last light, elsewhere"), updated for the Shotsmith port: targets iPhone 6.9 and Android phone, locales English and German, Fraunces and Inter from `fonts/` on both stores. Every word on the screenshots is in `claims.json` with its source.

1. **Direction:** "Last light, elsewhere." One continuous golden-hour coastline that slides from sunset to first stars across the five screens, like a row of postcards bought on one evening. Dreamy, warm, unhurried, premium.
2. **Built from:** the user's words "dreamy and cinematic", "golden-hour travel feeling", "postcard at dusk", "screens connect into one continuous panorama", "3D welcome". Borrows the Panorama preset (one scene in strip coordinates, each screen a window onto it) and the Cinematic preset's structure (phone-less opener with headline and two proof rows, one idea per screen, finale grid). New: warm light instead of near-black, a serif display face, postcard ornaments.
3. **Palette** (the strip moves left to right through the evening):
   - `#FFD7A0` sun gold: sun core, accent line of each headline, eyebrows, key highlights.
   - `#F29A5B` apricot: horizon glow on screen 1 (golden hour).
   - `#E0707A` coral rose: screen 2 sky mood.
   - `#A8639E` dusk mauve: screen 3 sky mood.
   - `#4B4A8C` twilight violet: screen 4 sky mood.
   - `#1B1E44` indigo night: screen 5 and the upper sky everywhere.
   - `#120F24` deep ink: sea and hills in shadow, base under the proof rows.
   - `#FFF6EA` warm white: headlines and row titles.
   - `rgba(255,240,226,0.92)` warm gray: sublines, over a soft dusk halo so they hold 3:1 on the coral sky.
   - App teal `#0B7D8C` (from the captures) only inside the phones and lifted cards, never as a mood.
4. **Type:** display: Fraunces (SIL OFL 1.1), soft optical-size serif, roman at 560 for line 1 and the italic cut at 420 in sun gold for line 2. Text: Inter (SIL OFL 1.1) 400 and 700 for eyebrows, sublines, proof rows, the finale grid and the postmark wordmark. The same files on the App Store and Google Play (`fonts/`, with their OFL texts), so no SF Pro anywhere. Every eyebrow sits at the same height and every headline at the same size.
5. **Screens:**
   1. Opener, no phone: "Your plans, / *all in one place.*" top left; low sun on the horizon near the right edge, glitter path on the sea, layered hills; gulls against the glow; two proof rows with 3D enamel tiles (plane glyph, clock glyph) at the bottom; a postmark with the ELSEWHERE wordmark whose cancellation waves run on across the seam into screen 2.
   2. "Your next trip, / *at a glance.*" coral sky; phone upright, cropped at the bottom, standing in the sea; the "Lisbon in spring" card lifted forward over its own region.
   3. "Plan each day, / *hour by hour.*" mauve sky; phone tilted in 3D; the "Sunset lookout" row lifts toward the viewer out of an empty recess.
   4. "Good places, / *close to you.*" violet dusk with the first town lights; the phone lies back on the water like a map on a table, and the "Miradouro lookout" card stands up out of it, facing the viewer.
   5. Finale, no phone: "All your plans. / *One place.*" indigo night with stars, the moon and the lit coastline; a two-column grid of line icons for features that exist only.
   - Android phone: the same story as its own panorama at the 9:16 height (horizon, sun, moon and postmark placed from that height), with smaller phones and tighter rows through `s.pick`, never the iPhone layout squashed.
6. **Craft and tech:**
   - Sky, sun, halation, cloud bands, sea glitter, layered hills with aerial perspective, town lights and their reflections, stars and moon: one GLSL fragment shader evaluated in strip coordinates, so every screen joins exactly at the seams; grain and dither against banding. Point lights stay a few px clear of each seam so the seam check reads the strip as continuous.
   - 3D proof tiles: Three.js through the kit's `createRenderer()`, clearcoat enamel with a dusk studio environment, soft contact glows, a camera offset to the screen's place in the strip.
   - Postmark, waves, line icons and gulls: SVG.
   - Phones: the kit's `device()` in the silver finish, status bar repainted as a clean 9:41 bar. Lifted cards: the kit's `lift()`, cover on the upright phone, recess on the tilted ones, with the warm layered card shadow.
   - Type: HTML/CSS; headlines fitted by the kit's `headline()`, everything below placed from its bottom.
   - Per-screen light pools behind the phones fade to zero inside their own screen, so no glow makes a step at a seam.
7. **Avoid:** claims not in the store copy (offline use, live flight tracking); flight paths, plane markers or arcs that would read as tracking; stock photos; bloom over white UI; the same hue on neighbouring screens; seams through a headline, phone face or card.
8. **Declined:**
   - "Works offline": not in the verified store listing, and the captures do not show it. Not used in copy or imagery.
   - "Live flight tracking": not in the store listing or the captures. Not used, and no flight paths, plane markers or arcs anywhere, so the imagery does not imply it either. The plane glyph on the opener and finale stands for "flights" in an itinerary, as in the store copy.
   - Not sourced, so not used: ratings, awards, press, counts, "#1".
