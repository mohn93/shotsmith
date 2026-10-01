# Examples

Three fictional apps, made by an agent with the `store-screenshots` skill from a one-paragraph request each, then ported to the Shotsmith kit. Every example targets iPhone 6.9 and Android phone in English and German, and builds with no findings.

| Example | Request in short | Shows |
| --- | --- | --- |
| `savory/` | Warm food magazine, serif, paper texture, no 3D | Custom direction, procedural paper grain, flat tilt, lifted cards |
| `elsewhere/` | Golden-hour travel postcard, one continuous panorama, 3D welcome | Panorama across five screens, Three.js, seam checks |
| `daily-arc/` | Bold, bright, playful, chunky rounded type | Flat color blocks, SVG ornaments, phone-less card stacks |

The captures are generated (`node scripts/example-captures.mjs`). The trial requests also asked for claims the store copy cannot support (a "#1" badge, a 4.9-star laurel, offline mode and flight tracking); each example's README says what was declined and why.

Build them all with `npm run examples`, or one with `node scripts/build-examples.mjs savory`. Review images: `node dist/cli.js thumbs iphone-6.9 -C examples/savory --from export`.
