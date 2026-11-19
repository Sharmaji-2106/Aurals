# The Final Draw

> **Superseded.** The production reveal is now the Selection Rail — see
> `docs/selection-rail.md`. `/final-draw-studio` is kept as a working route and
> its studio tests still run; only its production handoff test moved, because
> that handoff belongs to the rail now. Everything below describes the sequence
> as built, and the reasoning in it — the time-pure clock, the solved landing,
> the measurement trap in §3 — still applies to what replaced it.

The reveal at the end of the discovery sequence. Two stacks of discovery cards
enter, converge, riffle into one, and the top card rises and turns over to show
the listener's strongest match — which then travels into its place on the
results page as the same element.

This is the handoff document for that work: what exists, where it is, what was
decided and why, and what is not done.

---

## 1. Where it lives

| What | Where |
|---|---|
| The scene | `web/src/components/final-draw/` |
| Isolated studio route | `web/src/app/final-draw-studio/` → `/final-draw-studio` |
| In the product | the `draw` act of `web/src/components/discovery/discovery.tsx`, over `/match` |
| Blender art direction | `design/final-draw/` |
| Tests | `web/e2e/final-draw.spec.ts`, `-capture.spec.ts`, `-perf.spec.ts` |

### The scene's files

| File | Responsibility |
|---|---|
| `contract.ts` | Stages, timings, card dimensions, the cast. No behaviour. |
| `choreography.ts` | `poseAt(time, card)` — every card's position, as a pure function |
| `card.tsx` | The physical card: body, painted edge, printed back, reveal face |
| `final-draw.tsx` | The stage, the lighting, face culling |
| `response-curve.tsx` | A measured frequency response, drawn |
| `use-playback.ts` | One clock, and the operations on it |
| `controls.tsx` | The studio's transport and stage navigator |
| `demo-data.ts` | Development fixture, captured from a real engine run |

---

## 2. The decisions that shaped it

### It is DOM and CSS, not WebGL

The winning card has to arrive at the exact place the recommendation occupies on
the results page, as the same element, with its layout morphing on the way. A
canvas cannot become an HTML hero; a `div` can. Everything else followed from
that, including the card being built from gradients and shadows rather than
materials.

It also avoided repeating a failure. The concept this replaced was a WebGL
domino cascade that reached a strong look and ran at **1.9 FPS**, because a
planar reflector was re-rendering the whole scene into a texture every frame.
There is no render target here at all.

### Everything is a pure function of `time`

No card keeps its own state. Pause is "stop advancing the clock", replay is "set
it to zero", skip is "set it to a mark", scrubbing works because the frame at
*t* is the same frame every time you visit *t*, and a speed change cannot
desynchronise anything because there is only one clock to scale. Those five
controls were free rather than five features to debug, and `final-draw.spec.ts`
asserts that seeking away and back reconstructs byte-identical transforms.

### The packets are held apart, against physical fidelity

A real riffle brings the two halves corner to corner. Built that way, it failed
on screen: the growing middle stack is itself a full card wide, so adjacent
packets overlap it on both sides and the shot reads as one confused mass rather
than as two things becoming one. The packets now hold just over a card's width
from the centre and the interleave happens in clear ground between three
distinct masses. A viewer who cannot see the interleave has not been shown
anything.

The Blender art direction, developed in parallel and without knowledge of this
choice, arrived at the same arrangement.

### The riffle accelerates

Cards release bottom-up with the gap between consecutive releases shrinking from
**0.36 s to 0.11 s** across twenty cards, each flying for **0.6 s** and
decelerating into the stack. That accelerating ripple is what a hand riffle does
as the bend straightens out, and it is most of what makes the sequence read as a
physical act rather than a loop of identical steps. Evenly spaced releases look
like a metronome.

### The card back is a response curve, not the brand mark

It started as the Auralis mark — nine bars radiating from a point — enlarged and
centred. It read as a daisy, and then as a loading spinner. Three attempts
across two renderers, including one built from the mark's exact coordinates with
its 3.33:1 bar-length ratio verified in the mesh, all produced the same flower.

A radial mark at a third of a card width is simply not a centrepiece: the
symmetry dominates and the length variation stops registering. The mark is now a
maker's mark at 3.5% of the card width, locked up with the wordmark in the
corner where it works, and a debossed response curve carries the card. That is a
better centrepiece anyway — it is literally what Auralis measures, it is
unmistakable, and a long groove catches light along its whole length, so it
survives the grazing angle the mark never did.

### Thickness is real on one card and painted on the other nineteen

The card that turns over is genuinely extruded from eleven laminae, because a
painted edge is only correct from the angle it was solved for, and that card
leaves the angle. Every other card paints its edge with three offset
box-shadows, whose offsets are solved so that they project exactly onto the
thickness direction (`edgeOffset` in `choreography.ts`).

This was forced by measurement — see below.

---

## 3. Performance, and a measurement trap worth knowing about

The scene runs at a **flat 60 FPS** on this machine's GPU.

Getting an honest number took some doing, and the lesson generalises:
**Playwright's bundled Chromium falls back to SwiftShader**, which rasterises
every frame on the CPU. Under it this scene measures in the twenties. Several
hours of optimisation were spent against that number before the renderer was
checked — the probe is one `WEBGL_debug_renderer_info` call and should have been
the first thing done, not the tenth.

`playwright.gpu.config.ts` runs the harness headed with the real GPU:

```
npx playwright test e2e/final-draw-perf.spec.ts --config=playwright.gpu.config.ts
```

`final-draw-perf.spec.ts` reads the renderer and picks its threshold
accordingly: 50 FPS on a GPU, and a deliberately low collapse floor under
software rasterisation, where the number means little. It skips itself entirely
when more than one worker is running, because a frame rate measured while other
browsers compete for the same CPU is not a measurement of this scene.

Two optimisations survived the correction because they are real work saved
rather than software-rasteriser tuning:

- **Face culling.** Cards lying flat in a stack share a footprint exactly, so
  every one but the topmost is completely hidden. Faces are printed only on
  whatever is on top of each of the three stations, on anything in flight, and
  always on the card that turns over — four faces instead of twenty.
- **The painted edge.** Laminating all twenty cards put eighty planes inside the
  stage's 3D rendering context for the compositor to sort on every frame.

---

## 4. Real data, and what is not real

**Nothing on the winning card is invented.** In the product it carries the
engine's own top-ranked earphone: the catalogue's brand and model, the predicted
preference with its 10–90 interval, and one of the engine's own computed
reasons. The artwork in the card's well is the same `ProductArt` element that
becomes the results hero.

**There are no product photographs.** All 203 earphones were imported from
AutoEq measurement files, which carry brand, model, form and rig and nothing
else. `ProductArt` already handles this honestly — a real photograph where one
has been gathered, and otherwise the drawing made from the earphone's own
measured response, labelled as a drawing. Nothing here pretends a generated
shape is a picture of hardware, and no stand-in product was created for the
Blender renders either.

**The studio's fixture is real data, labelled.** `/final-draw-studio` has no
live recommendation, so it shows Truthear x Crinacle Zero RED with the score,
interval and reason captured from an actual engine run on 8 November 2026, and
the earphone's genuine measured frequency response — 695 points read out of the
catalogue and downsampled to 96 for drawing, measured by **oratory1990** on a
**GRAS 43ACB** and redistributed through AutoEq. The credit travels with the
curve, the card carries its provenance line, and the page is marked
`DEVELOPMENT DEMO`.

The generic shuffle cards carry no product identity at all.

---

## 5. The handoff into the results page

The requirement was that the winning card becomes the actual top-recommendation
hero, with no duplicate, no teleport and no fade-out-fade-in.

The mechanism already existed: `/match` shares a `layoutId` (`WINNER_ART`)
between the discovery sequence's hero and the `Spotlight`'s artwork, and motion
measures both ends. The Final Draw inherits it — the artwork inside the winning
card's well *is* that element.

What makes it faithful is the card's final orientation. The hero's turn applies
`rotateZ(tilt.z) rotateX(-tilt.x)`, the exact inverse of the stage's own
`rotateX(tilt.x) rotateZ(-tilt.z)`, so at the end of the flip the card is
precisely parallel to the viewport. A bounding box is only a faithful
measurement of a rectangle that is square to the screen, and that is the box
motion measures when the overlay closes.

`final-draw.spec.ts` drives a real listener from the landing page to their
results and asserts that exactly one artwork element survives, carrying the same
slug the card showed.

---

## 6. Where it sits in the sequence

The draw is the **last** act, after the community research, not the reveal in
act three.

That required a change to production copy: act three ("The ranking") no longer
names the winner. It now reports that everything has been scored and placed in
order and that the strongest is held back for the draw. Revealing the
recommendation three seconds in and then spending twelve seconds dramatically
revealing it again would be anticlimactic, and putting the draw before the
research would delay the only genuinely slow part of the sequence for the sake
of presentation.

**This is a product decision and it is reversible.** If the winner should be
named in act three after all, restore the `ranking` panel in `discovery.tsx` and
the draw still works unchanged.

Reduced motion skips the draw entirely and goes straight to results, as it
already did for the rest of the sequence.

---

## 7. The Blender work

Produced by GPT-6 Astra at high reasoning effort, delegated and art-directed
over five rounds. It was given the brief, could not see its own renders, and was
corrected from them each round.

| Deliverable | Path |
|---|---|
| Editable scene | `design/final-draw/final-draw.blend` |
| Reproducible build script | `design/final-draw/build_scene.py` |
| Nine rendered stills | `design/final-draw/renders/` |
| 12 s preview, 1280×720 at 24 fps | `design/final-draw/preview/final-draw-preview.mp4` |
| CSS translation recipe | `design/final-draw/CSS-TRANSLATION.md` |
| Art direction and exact timings | `design/final-draw/ART-DIRECTION.md` |
| Scene validation | `design/final-draw/verify_scene.py` |

Blender itself is not installed on this machine and was not installed into it:
`G:\tools\blender\blender-5.2.3-windows-x64\` is a portable extraction, made
fully self-contained with a local config directory.

What the Blender work actually contributed, beyond reference images: the card's
physical proportions (190 × 125 × 2.8 mm, 11 mm radius, 0.35 mm bevel), and the
three-light rig — a cool key from above left, a faint cyan fill from the right,
and a low warm rim raking the top-left corner. That warm-against-cool split is
what makes a dark surface read as lit rather than as underexposed, and it is
transcribed directly into `card.tsx` from `CSS-TRANSLATION.md`.

Its scene validation is genuine: watertight core geometry, zero collisions
across all 288 animation frames, and a measured 56 mm stack for twenty cards.

---

## 8. Verification

Run from `web/`, with the stack up (`python scripts/dev.py up`):

```
npx tsc --noEmit
npx eslint src e2e --max-warnings=0
npx prettier --check src e2e
npm run test                                    # 59 vitest
npx playwright test                             # 24 pass, 4 skipped, 0 fail
npx playwright test --workers=1                 # 26 pass, incl. the perf guard
npx playwright test e2e/final-draw-perf.spec.ts --config=playwright.gpu.config.ts
```

Two specs are deliberately skipped in a default run, and both say so when they
skip:

- **The perf guard** skips whenever more than one worker is running, because a
  frame rate measured while other browsers compete for the same CPU is not a
  measurement of this scene. It runs under `--workers=1`, and the GPU config
  above is the one that gives a number worth quoting.
- **The capture harness** is opt-in behind `CAPTURE=1`. It is a camera rather
  than a test: it asserts almost nothing, and thirteen screenshots per tier take
  workers away from tests that do.

```
CAPTURE=1 npx playwright test e2e/final-draw-capture.spec.ts   # → test-results/final-draw/
```

A note for whoever adds the next heavy journey test: the suite runs fully
parallel against a single API process, and it has very little headroom. Adding
a second full onboarding-to-results journey was enough to start timing out
*other* specs, including one that was green before. That is why the match test
calls `test.slow()` and why the capture harness is opt-in.

Verified by watching, not by reading code: both decks enter and are distinct;
card thickness is visible; the interleave is legible as two stacks becoming one;
the stack settles; the top card separates, rises and turns in genuine 3D; the
real recommendation appears; the card becomes the results hero with no duplicate
and no jump; pause, resume, replay, reset, skip, scrub, speed and stage
navigation all work; desktop and Pixel 7 both compose without horizontal
overflow; reduced motion gets a still; no console errors.

---

## 9. What is not done

- **Sound design.** None. The brief made it optional and conditional on suitable
  assets existing; none do, and stock effects would be worse than silence.
- **Mobile is recomposed, not redesigned.** The stage scales down in CSS
  breakpoints so both decks stay in frame with their separation intact, and the
  winning card scales back up as it turns so the reveal stays legible. It is
  correct and uncluttered, but a phone-first composition would frame it
  differently.
- **Product photographs.** Still none, for any earphone. The pipeline accepts
  them and the card upgrades for free when they exist.
- **The Blender card front** carried a placeholder for the response curve
  through round four; the real measurement was cleared for it in round five.
- **Nothing is committed.** This repository still has zero git commits.
