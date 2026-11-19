# The Selection Rail

The production recommendation reveal. A line of premium cards travels right to
left through a dark studio, decelerating until the engine's highest-ranked
earphone comes to rest exactly in the centre of the frame — and that same card's
artwork then becomes the recommendation hero on the results page.

| | |
|---|---|
| Studio route | **`/selection-studio`** |
| In the product | the `draw` act of `components/discovery/discovery.tsx`, over `/match` |
| Code | `web/src/components/selection/` |
| Tests | `e2e/selection.spec.ts`, `-capture.spec.ts`, `-perf.spec.ts` |

---

## 1. What it is made of

| File | Responsibility |
|---|---|
| `contract.ts` | Stages, timings, card geometry, rail spacing. No behaviour. |
| `choreography.ts` | `poseAt(time, index)` — every card's pose, as a pure function |
| `card.tsx` | The card as a manufactured object |
| `rail.tsx` | The studio: environment, lighting, composition, reveal copy |
| `entries.ts` | Who rides the rail and in what order |
| `demo-data.ts` | Development fixture, captured from a real engine run |

Technology: React, CSS 3D transforms, and the project's existing `motion` for
the handoff. **No GSAP and no new dependency.** The brief allowed GSAP or the
existing library; the sequence needed one eased rail offset and a deterministic
clock, and the project already had both patterns working.

**No Three.js, no Blender, no canvas.** The whole scene is nine cards and four
gradients.

---

## 2. The winner lands on an exact pixel

This was the one unmissable requirement, and it is cheap because of how the
sequence is built rather than because of care taken at the end.

The rail travels **once**, over a single eased span, from off the right edge to
its resting place. The stage marks — arrival, travel, deceleration — describe
what the viewer is seeing at different moments; they are not separate animations
handing over to one another. A sequence assembled from handovers is exactly
where drift and end-of-animation layout jumps come from.

`REST_OFFSET` is defined as `-WINNER_INDEX * SPACING`: the value that, by
construction, puts the winning card at x = 0. The easing is defined to reach 1.
There is no approximation anywhere in the chain to drift from.

`selection.spec.ts` asserts the card's centre against the frame's to within
1.5 px. It measures against **`main`'s box, not the window**: this project sets
`scrollbar-gutter: stable`, so a 1280 px window has a 1270 px content area and
the centre a viewer actually sees is 635, not 640. My first version of that test
failed by exactly 5 px, and the test was wrong, not the rail.

---

## 3. Depth is a function of position, not of index

A card's scale, opacity, lift and turn are read continuously from how far it is
from the centre of the frame. So a card swells as it sweeps through the middle
and subsides as it passes, and nothing ever has to decide which card is "the
third one on the left".

The falloff exponent is tuned to the brief's own hierarchy — roughly 0.78, 0.54
and 0.28 opacity at one, two and three slots out. The first attempt used a much
steeper curve and the neighbours washed out to grey smudges that said nothing
about the collection; the point of showing them is that they are real
possibilities.

The rail itself is never drawn. It is suggested by a band of floor light under
the cards, a horizon where the wall meets the floor, and the cards' own
alignment. There is no track.

---

## 4. The card

362 × 219 at 1.65:1, 17 px radius, growing to 1.12× when chosen. Dark graphite
with a satin sheen, a fine grain, a raking highlight from the upper left, and an
edge made of a lit top lip, a dark bottom one and a hairline all round.

**Nothing glows.** The chosen card is distinguished by scale, by the light that
comes up behind it, by the shadow it casts as it lifts, and by what it is
allowed to say — never by a coloured border.

**Only the chosen card quotes a number.** A rail of scores would turn a curated
sequence into a leaderboard, which is not what the sequence means. Every other
card shows its manufacturer, its model and who measured its portrait.

The product well takes 47.5% of the card and is milled into it: a dark lip where
the wall faces away from the light, a lit one where it faces into it. An empty
flat rectangle reads as a mistake; an empty recess reads as a place where
something belongs.

---

## 5. Product imagery — the part the brief could not have

**The catalogue contains zero product photographs.** All 203 earphones were
imported from AutoEq measurement files, which carry brand, model, form and rig
and nothing else; `data/iem-images/index.json` is an empty array and every
`Recommendation.image` in the fixture is `null`.

The brief calls real product imagery non-negotiable and then gives the correct
fallback itself: *"If an image is missing, use a restrained placeholder and
identify the missing asset. Never pretend a placeholder is a genuine product
image."*

So the well shows `ProductArt` — the project's established portrait, drawn from
the earphone's own measured frequency response, credited on the card to whoever
measured it. That is not a stand-in for a photograph; it is the thing the
recommendation was actually computed from, and it is the same component the
results page already uses. **The moment real photography exists, `ProductArt`
shows it and this card needs no change at all.**

One honest consequence: these seven earphones all measure similarly, so their
portraits look similar. Photography would differentiate them far better. The
cards lean on brand and model type to tell them apart.

---

## 6. The handoff into the results page

The requirement: the chosen card becomes the actual recommendation hero, same
object, no duplicate, no fade-out-fade-in.

The mechanism already existed and the rail inherits it. `/match` shares a
`layoutId` (`WINNER_ART`) between the discovery sequence and `Spotlight`'s
artwork; the rail's winning card wraps its `ProductArt` in that element. motion
measures the source's screen rectangle and animates the destination from it, so
the artwork the listener watched settle is literally the artwork that arrives.

`selection.spec.ts` drives a real listener from the landing page to their
results and asserts that exactly one `[data-art]` element survives, carrying the
same slug the card showed.

---

## 7. Data integrity

The rail does not choose anything. The winner is whatever the engine ranked
first; `WINNER_INDEX` is the only fact about placement the code knows, and
`entries.ts` simply puts the top result there.

Rank, predicted preference, interval, match grade and the reasons are the
engine's output (`harman-personal/1`, Harman in-ear 2019, 203 measured
earphones). No prices, stock, review counts or specifications appear anywhere,
because none are held.

The studio's fixture is eleven complete `Recommendation` objects exactly as the
API serialises them, captured from a real run and labelled on screen. They are
full objects on purpose: the studio then renders the same `ProductArt` with the
same data production does, so there is no second code path to diverge.

---

## 7a. Frame rate: what was actually wrong

The rail measured 60 fps in its own studio and stuttered badly on `/match`.
Three separate causes, all in the product rather than in the sequence:

1. **The rail was driven by a 120 ms `setInterval`.** The discovery sequence
   runs on one — correct for deciding which act is on screen, hopeless for
   animation — and the rail inherited it. That is ~8 fps *by construction*.
   `components/discovery/rail-act.tsx` now gives it a real rAF clock, in its own
   component so sixty renders a second do not re-run the act list and the
   research feed alongside it.
2. **A full WebGL scene was rendering invisibly underneath it.** The candidate
   field was faded to `opacity: 0` for the draw rather than unmounted, so it
   went on drawing every frame behind the rail. It now leaves the tree.
3. **Nine canvases were animating at once.** Every `IemPortrait` keeps its own
   frame loop. `animate` is now optional: only the chosen card drifts, the
   candidates hold still, and the results-page collection holds still too.

Measured after: **60.5 fps on `/match`**, against ~8 before.

## 7b. The playlist arrival

Traced end to end rather than guessed at. What a listener actually saw after
pasting a playlist:

```
  323ms  "Opening your links…"   ← a flat panel and a pulsing line
 5588ms  the sequence begins
13028ms  it ends
```

Five and a half seconds of nothing, then covers, grain, silhouette and handover
crammed into seven and a half. That is the whole of why it felt rushed: the
sequence was not fast, the wait in front of it was empty.

Two things fixed it, neither of them the animation's timing:

- **The wait now shows the actual playlist.** `/music` already fetches a link
  preview for every URL to validate it, cached indefinitely under the same key
  — so on the way here they come back from cache and the real title, channel and
  cover are on screen in about a frame. The resolver cannot supply this: it only
  learns the title at the moment it also gets the songs, which is the moment
  this screen stops being needed.
- **One backdrop for both halves.** The holding screen used a flat panel and the
  sequence a deep radial gradient, so the handover was also a change of scene.

The sequence itself went from 7.5 s to 8.8 s, which is the only timing change.

A note on something that turned out not to be a bug: tracks arrive **in one
batch**, not progressively, so the cast cannot grow mid-animation for a single
playlist. Waiting for the resolver to finish before starting is still right —
several links do resolve separately, and the grain's buffers are keyed on how
many songs there are — but it was not the cause of anything visible here.

## 8. Performance

| | Software rasterisation | Real GPU |
|---|---|---|
| Frame rate through the travel | **56.8 fps** | **60 fps** |
| Elements | 69 | 69 |

Sixty-nine elements, one transform string per card per frame, no layout work in
the loop, no canvas, no filters. It holds frame rate even under SwiftShader,
which is where the 3D boutique measured about 5 fps — the strongest argument
there is for the brief's instruction to drop the 3D environment.

`selection-perf.spec.ts` reads `WEBGL_debug_renderer_info` and picks its
threshold accordingly, and also fails if the rail ever grows past 220 elements,
because a rail with hundreds of nodes has stopped being nine cards.

---

## 9. Responsive

Desktop keeps the spacious composition. `SPACING` is 404 px specifically so five
cards are meaningfully in frame at **1280**, not only at the brief's 1440
reference — at 452 it looked spacious on paper and showed three cards on a
laptop.

Narrower viewports get a smaller rail through CSS breakpoints, and the chosen
card scales *back up* as it settles so the reveal stays legible. Both are custom
properties, so a resize or a rotation costs nothing: no measurement, no
re-render, no second source of truth about viewport width.

`prefers-reduced-motion` renders the settled reveal as a still, with no clock
and no transport.

---

## 10. Verification

```
npx playwright test                      # 46 pass, 12 skipped, 0 fail
npx playwright test e2e/selection.spec.ts --workers=1
npx playwright test e2e/selection-perf.spec.ts --config=playwright.gpu.config.ts
CAPTURE=1 npx playwright test e2e/selection-capture.spec.ts   # → test-results/selection/
```

Browser screenshots, desktop and Pixel 7, in `test-results/selection/`: arrival,
settled composition, travel, sweeping, decelerating, settling, selected, reveal,
held, the clean composition with controls collapsed, and the controls open. The
production handoff writes `match-rail.png` and `match-settled.png`.

---

## 11. What changed in production, and what did not

- The `draw` act of the discovery sequence now plays the Selection Rail. `/match`
  passes it the full ranking so the rail shows real candidates rather than the
  winner alone.
- `DRAW_MS` dropped from 12.2 s to 11 s to match the shorter sequence.
- The overlay's own light wash lifts during the draw. Two sets of lighting over
  one another is what made the rail look flat the first time it ran there.
- `usePlayback` moved to `lib/playback.ts` and is now shared by both sequences
  rather than duplicated.
- **`/final-draw-studio` and `/boutique-studio` are untouched and still work.**
  Their specs still run; only the Final Draw's *production* handoff test moved
  to `selection.spec.ts`, because that handoff is now the rail's.

## 12. Known limitations

- **Almost no product photography.** One earphone has a real manufacturer
  photograph — Moondrop Chu, from Moondrop's own product page, recorded in
  `data/iem-images/index.json` with its source URL, credit and retrieval date.
  Truthear was unreachable, 7Hz rate-limited the request, and AKG and most
  others refuse automated fetches, so the rest still draw their measured
  response. **The licence is unconfirmed** and recorded as such: it came from
  the manufacturer's own page, which is the right source, but permission for
  commercial reuse has not been asked for.
- **Similar earphones produce similar portraits**, which weakens card-to-card
  differentiation in a way photography would fix.
- **The travelling cards are deliberately quiet** — manufacturer, model and
  measurement credit only. That is the brief's restraint, but it does leave the
  right half of a passing card sparse.
- **Nothing is committed.** This repository still has zero git commits.
