# The Edition

A substantial navy hardcover on a smoked-glass table, on an oceanfront terrace at
sunset. The terrace comes up out of dusk; the lens racks from the sun on the sea
to the book; a highlight crosses the pink-to-champagne foil of the **Aurals**
wordmark; the cover lifts and falls open, and ten leaves turn through a
publication about listening. The camera settles on the selected earphone's
spread, pushes into its photograph until the earphones fill the frame, and the
light changes — paper, sunset, dusk, the app's own night. Then it pulls back, and
what it pulls back to is the real `/match` page: the product card, then the
listener's Sound DNA.

| | |
|---|---|
| Studio route | **`/book-studio`** (14 s; Skip, Esc, opt-in Sound, Controls: scrub, replay, speed, photograph sources). **`/book-studio?sheet`**: every page flat, for proofreading |
| Code | `web/src/components/book/`, and `web/src/components/match/results.tsx` (the `/match` tree it lands on) |
| The terrace | `design/book/build_terrace.py` (Blender, Cycles) → `finish_terrace.py` → `web/public/book/terrace/` |
| The book's surfaces | `design/book/make_textures.py` → `web/public/book/tex/` |
| Photographs | `design/book/prepare_product_images.py`, `design/book/cutout.py` → `web/public/book/products/`; Nova's matte is also the catalogue's photograph (`data/iem-images/`) |
| The page it lands on | `design/book/capture_sample_match.py` → `web/src/components/book/sample-match.json` |
| Review | `design/book/review/` — named moments and a real-time recording |
| Tests | `src/components/book/book.test.ts` (27), `e2e/book.spec.ts` (8 × desktop and phone), `e2e/book-perf.spec.ts` (GPU) |

Arc: **anticipation** 0–1.8 s · **opening** 1.8–3.4 · **discovery** 3.4–8.75 ·
**reveal** 8.75–10.85 · **recommendation** 10.85–14.

---

## 1. What changed in this version

| Brief | Done |
|---|---|
| Replace the environment with the oceanfront sunset | A terrace modelled, lit and baked in Blender: sky, sea, coast, glass balustrade, villa, canopy; a smoked-glass table built live so it reflects the book (§2) |
| A thicker, better-made book | Text block 18 → 24 mm, boards 3.2 → 3.6 mm, spine 5.5 → 7 mm proud and a wider joint; leaf lines in the page edges carry a normal map so a low sun picks them out |
| The cursive wordmark | Larger on the cover; tagline upright, tracked serif (§4) |
| Richer pages | More writing on every text spread; each product photograph carries its published specifications; the selection says why it fits (§5) |
| Cinematography | A new opening off the book's front-left corner, toward the sun; a rack focus; the book reflected in the glass (§3) |
| One ending, into the real `/match` | Precise zoom into the earphones → the light changes into `/match`'s palette → pullback onto the actual product card → scroll to the existing Sound DNA (§6) |

## 2. The terrace

Built in Blender because its light is global illumination — a low sun across
polished stone, the sky's colour in every surface, warm rooms spilling onto the
terrace — which a browser cannot compute per frame and Cycles computes once.

- **Far** (`terrace-sky.webp`): the sky, the sun, the sea and the coast, rendered
  all the way round from the book. The sky is a function of direction — a warm
  gradient toward the sun and a cool one away from it, blended along the
  horizon, so the glow is a band and not a disc — with thin stratus projected
  onto a plane overhead. The sea is rippled glass-smooth water reflecting it and
  the sun. A city sits on the coast to the right, windows lit, a few neon crowns.
  Everything in it is hundreds of metres away or more, so it is drawn as a
  backdrop at infinity, already tone-mapped with the scene's own operator.
- **Near** (`terrace.glb`): stone floor, frameless glass balustrade with a steel
  cap, the villa's glass wall with a lit room and sheer curtains behind it, a deep
  canopy whose edge carries a line of warm light. The villa is drawn with its
  light baked in; the floor's light is baked too, but its stone and gloss are
  live, so the sky's reflection in it moves with the eye.
- **Light** (`terrace-env.hdr`): the whole terrace seen from the book, used as the
  environment the leather, foil, paper and glass reflect.
- **The table** is three.js, not Blender: smoked glass that reflects the book as
  it opens (a mirrored camera draws only the book into a texture the glass
  samples), a glowing 12 mm edge, a turned bronze pedestal, the book's shadow on
  the glass.

The book's frame is fixed by its ending (the page's head is "up" in the last
frame), so the terrace turns about the table instead (`TERRACE_TURN`, −14°), which
puts the sun off the book's front-left corner. Nothing decorative: no plants, no
props.

What went wrong first, for the record: Blender's camera clips at 100 m by
default, so the first previews showed the sea out to 100 m and the sky mirrored
beyond it, and the coast's reflection appeared with no coast; the sun's glow was
first a round blob and became a horizon band; the reflection pass first came out
registered to a stale measurement (§6).

## 3. Light and lens

- **Key**: the sun itself, warm, from behind the book and to its right, a few
  degrees higher than it sits in the sky so the pages are lit rather than grazed.
  It throws the book's shadow long across the glass.
- **Fill**: warm and soft from the front left — the villa's rooms and canopy
  lights behind the camera — so the spine and the ivory read as themselves.
- **Practical**: the lit rooms to the right.
- **Foil highlight**: an art-directed band in the cover's shader, as before.
- **Neutral tone mapping** (Khronos); the backdrop was rendered with the same
  operator in Blender, so sky and scene agree.
- **Camera**: opens low at the height of the glass, a 38° lens off the book's
  front-left corner, horizon in the upper third, sun and its path on the sea to
  the left of the book, the coast behind it; tracks left and rises as if walking
  round the table; climbs over the pages; ends on the composition the page was
  laid out for. One Catmull-Rom path in time, backing away along its own line of
  sight on narrower screens.
- **Depth of field**: a rack focus from the horizon to the book in the first two
  seconds — the backdrop is blurred with a golden-angle disc of taps, as a lens
  would, not a box filter. No post-processing pass: the page must end as its
  exact artwork.

## 4. The wordmark

The reference shows a flowing calligraphic script in sunset pink to champagne
gold. The book already used Allura (the face the brand film's end card was traced
from); it is now set larger on the cover and on the spine, embossed as foil. The
tagline is upright Instrument Serif, lightly tracked, so a refined serif sits under
a flowing script without competing. The reference image spells the name
"Auralis"; the book keeps **Aurals**, the current brand.

## 5. The publication

Eleven spreads, twenty-two pages, every one with more to read than before:

- Text spreads gained writing that claims nothing about a specific product:
  what Aurals listens for, how to read the band chart, sibilance and vocal
  tuning, three things called "detail", what helps imaging, what a hybrid is.
- Each product photograph carries its **published specifications**, copied from
  the same page the photograph came from (re-read 2026-11-12): impedance,
  sensitivity, response, drivers, materials. Only what the page states is
  printed — Truthear gives no impedance for Nova, Kiwi Ears gives the Aether two
  different sensitivities (so neither is printed), and HiFiGo lists one table for
  Performer 5+2 and Performer 7 together, which the page says.
- The selection spread says **why it fits** — the engine's own region figures for
  the sample listener — and carries Nova's sensitivity and response; the plate
  quotes Truthear's one-line description, attributed.

Proofread at `/book-studio?sheet`.

## 6. The ending

After the handoff the film is the DOM, and the camera is a transform: a camera
perpendicular to a flat page that moves toward it sees exactly a scale.

1. **Handoff** (8.25 s): the last 3D frame is the DOM's own SVG, as before.
2. **Zoom** (8.75–10.05): the camera aims at the earphones' centre and closes
   until they fill nine tenths of the frame. Early in the push the printed
   photograph becomes a cutout registered to it pixel for pixel.
3. **The light changes** (9.95–10.95): a wash the world changes colour through —
   paper, sunset peach and rose, dusk violet, night — ending on the colour of the
   product card's plinth.
4. **The page arrives** (from 10.6): underneath, the real `/match` page is
   transformed so that its product card's photograph is exactly under the cutout.
   They are the same pixels — Nova's catalogue photograph is the book's matte —
   so when the cutout fades, what changes is only the grade `/match` gives its
   photographs.
5. **Pullback** (10.85–12.2): the page's transform eases to none; the product
   card, then the page, come into frame around the product.
6. **Sound DNA** (12.55–13.95): the page scrolls up to the listener's Sound DNA
   section, and rests where the whole signature is on screen. Then the page is the
   viewer's to scroll.

**Whose page.** The book is printed for a sample listener, so the page it lands on
is that listener's `/match` — the route's own components, given the engine's
actual output for the "Neon Odyssey" playlist (captured through the API by
`capture_sample_match.py`, which deletes the account it creates). It runs in its
own query cache, never touches the viewer's account, keeps saving local, and does
not offer the delete-account control. Its heading reads "Sample listener's sound".

**Registration is measured, not assumed.** The page measures where its own
photograph is, four times a second while the film plays and once more on arriving
at the end. In the browser the two images coincide (asserted within 1.5 px; in a
settled run, 0 px).

## 7. Sound

Off by default; a **Sound** toggle turns it on. Synthesised with Web Audio: a low
tone as the terrace appears, the board's landing, paper per leaf, one bell as the
camera arrives on the earphones, a breath of air as the light changes.

## 8. Measured (RTX 3090, 1440 × 900)

| | |
|---|---|
| Page turns | **60.2 fps** (vsync), book reflection in the glass included |
| The ending (light change and pullback over the real page) | **60.4 fps**, worst frame 16.8 ms |
| GPU textures over three replays | 47 → 47 → 47 |
| Handover registration | within 1.5 px (asserted), 0 px settled |
| Console errors through the film | none |

The real page becomes visible on a still frame right after the handoff, under the
opaque overlay: its first paint cost a 50 ms frame when it was revealed mid-move.

## 9. Verification

```
npx vitest run src/components/book
npx playwright test e2e/book.spec.ts
npx playwright test e2e/book-perf.spec.ts --config=playwright.gpu.config.ts
BOOK_CAPTURE=1 npx playwright test e2e/book-capture.spec.ts --config=playwright.gpu.config.ts
```

## 10. Known limitations

- **Photograph licensing is unconfirmed** for all seven images, including Nova's
  photograph now in the catalogue. Fine for a prototype; not for public release.
- **The studio lands on the sample listener's `/match`, not the viewer's.** The
  edition on `/match` for the viewer's own result needs photography of whatever
  earphone that is; the catalogue has two.
- **Macro sharpness is bounded by the source**: Truthear publishes Nova at 1000 px,
  and the zoom fills the frame with it. No AI upscaling was used.
- **The sky's sun and the key light differ by a few degrees** of elevation, so the
  pages are lit rather than grazed. Art direction, stated.
- **The reference spells "Auralis"**; the book says Aurals. The app's own header
  (on the page it lands on) still says Auralis — no rename has been asked for.
- **Loading** is a few seconds: 22 pages printed, the terrace (about 3.7 MB, most
  of it the reflection HDR) fetched.
