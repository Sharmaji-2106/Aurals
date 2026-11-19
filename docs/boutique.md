# The Boutique

An interactive 3D environment: a dark walnut display wall with seven lit
niches, one per earphone. The camera moves through it, you can point at a
display to identify it and select one to be taken to it, and the recommendation
appears as an editorial layer over the environment rather than instead of it.

Route: **`/boutique-studio`**. Isolated; it does not touch any production route.

---

## 1. What was actually used

**Blender 5.2.3**, driven headless from `design/boutique/build_boutique.py`,
which builds the entire environment from an empty scene — geometry, booleans,
bevels, materials, lighting and six cameras — and renders the references.

**There is no Blender MCP in this environment.** The brief's addendum says it is
connected and available; it is not, and no such tool exists in this session. I
used the portable Blender I had already set up, scripted through its Python API,
which is slower to iterate but fully reproducible: the whole scene regenerates
from one file with one command.

In the browser: **three.js**, **@react-three/fiber** and **@react-three/drei**,
all already in the project. No new dependency was added — not GSAP either, since
the camera needed one eased controller and that is twenty lines.

| Deliverable | Path |
|---|---|
| Editable scene | `design/boutique/boutique.blend` |
| Build script (regenerates everything) | `design/boutique/build_boutique.py` |
| Reference renders, six shots | `design/boutique/renders/` |
| Exported geometry | `web/public/boutique/boutique.glb` (721 KB, 67 meshes) |
| Scene code | `web/src/components/boutique/` |
| Route | `web/src/app/boutique-studio/page.tsx` |
| Tests | `web/e2e/boutique.spec.ts`, `-capture.spec.ts`, `-perf.spec.ts` |

Rebuild and re-export:

```
blender.exe --background --factory-startup --python design/boutique/build_boutique.py -- \
  --render all --export web/public/boutique/boutique.glb
```

---

## 2. What is on display, and why it is not an earphone

**The Auralis catalogue contains zero product photographs.** All 203 earphones
were imported from AutoEq measurement files, which carry brand, model, form and
rig and nothing else; `data/iem-images/index.json` is an empty array.

The brief's own instruction for this case is §3.4: use clearly labelled neutral
placeholders rather than fabricating realistic IEMs. Since there are no images
at all, that applies to every display.

So the boutique shows what Auralis genuinely holds: **each earphone's measured
frequency response, engraved into a specimen card** standing on its pedestal —
a museum label, not a package. The curve is real geometry rather than a painted
texture, so it is physically there, catches light along its length, and survives
export. Every card's curve is that earphone's own measurement, and the overlay
names who measured it and on what rig.

That is not a workaround. A measured response is a truer likeness of how
something sounds than a photograph of its shell, and it is the thing the
recommendation was actually computed from.

Nothing in the scene carries invented branding, invented packaging, invented
specifications, prices, stock or reviews.

---

## 3. The data is real

The collection and its numbers come from an actual run of the engine —
`harman-personal/1`, against the Harman in-ear 2019 target, over all 203
measured earphones — captured into `web/src/components/boutique/products.ts`
and labelled as development data.

Rank, predicted preference, 10–90 interval, match grade and both reasons are the
engine's own output. The recommended product is whichever the engine ranked
first; the scene has no opinion about which that is, and `hero` is a data flag,
not a hardcoded slug.

Each product also carries its `anchor` — where its display physically stands,
read out of the Blender build — so the camera is sent to a real position rather
than to a guessed one, and the two cannot drift apart.

---

## 4. How it works

**Materials.** Procedural shaders do not survive glTF, so the GLB carries
geometry and names, and the browser rebuilds every material by name. The walnut
is generated at runtime into one 512px canvas tile: value noise on a torus, so
it tiles, sampled on coordinates stretched nine times harder along the board
than across it. Baking the Blender shader to textures would have worked and cost
several megabytes.

**Camera.** Exactly one controller writes to the camera, ever. Interaction
changes a *goal*; the controller eases toward it with frame-rate-independent
damping. That is why clicking a second display mid-move cannot strand the camera
between two animations — there is only one animation, and it simply acquires a
new target.

**Composition responds to the frame.** The shot is adapted every frame from the
viewport's aspect. A narrow landscape window backs the camera off to hold the
same horizontal extent. A portrait phone gets a *different* composition —
closer, centred on the hero group, accepting that the ends of the wall are out
of shot — because a 3.6 m wall in a tall narrow frame is either cropped or a row
of specks.

**Interaction** is expressed entirely as material state: each display has its own
material instances, and pointing at one turns its light up. Nothing moves,
nothing is outlined, nothing jumps. Hit targets are invisible panels in front of
each display, because raycasting a 9 mm card edge would be miserable to point at.

**The overlay** is ordinary React over the canvas — type belongs in the DOM where
it stays crisp and readable by a screen reader. It is a column against one edge,
not a slab across the middle, so the boutique stays visible. It is a *phase*
rather than a boolean, so closing it returns to exactly the state it opened from
without touching the camera.

---

## 5. Performance

Measured, not asserted:

| | Result |
|---|---|
| Draw calls while idle, over 2.5 s | **0** |
| Frames while the camera moves (RTX 3090) | **~50 fps** |
| GLB | 721 KB, 67 meshes |
| Textures | one 512px canvas tile, generated at runtime |

The scene renders **on demand**. It is static joinery, so a frame is only drawn
when the camera is moving or a display has lit up, and both of those ask for
frames explicitly. `boutique-perf.spec.ts` verifies this at the WebGL level by
patching `drawElements` before the page loads and counting: an idle boutique
issues zero draw calls, which is a claim worth checking rather than asserting.

Quality tiers come from the project's existing `quality()`: a coarse-pointer or
low-core device gets no shadows, dpr 1, no antialiasing and no generated
texture.

**Read the renderer before reading a frame rate.** Playwright's bundled Chromium
falls back to SwiftShader and rasterises on the CPU, where this scene measures
about 5 fps and that number means nothing. `playwright.gpu.config.ts` runs the
same spec on the real GPU. The perf spec reads
`WEBGL_debug_renderer_info` and picks its threshold accordingly.

---

## 6. Verification

```
npx playwright test                       # 34 pass, 8 skipped, 0 fail
npx playwright test e2e/boutique.spec.ts  # 5 behaviour specs
npx playwright test e2e/boutique-perf.spec.ts --config=playwright.gpu.config.ts
CAPTURE=1 npx playwright test e2e/boutique-capture.spec.ts   # → test-results/boutique/
```

Browser screenshots, desktop and Pixel 7, in `test-results/boutique/`: arrival,
full shelf, hovered display, recommended focus, another product selected, and
the overlay.

Confirmed by looking, not by reading code: the wall reads as architecture rather
than as a rectangle with cubes on it; the grain reads as timber; the cove
lighting works; the hero niche is distinguishable without a badge; hover
identifies a display; selection moves the camera smoothly and does not reload
the scene; the overlay carries the engine's real numbers and the measurement
credit; closing it returns to the same camera and selection; one canvas
throughout; no console errors; no horizontal overflow on either tier.

**A note about the test suite.** Adding this route pushed the suite past what
unbounded parallelism could sustain — five WebGL scenes rasterised on the CPU
alongside two full onboarding journeys against one uvicorn started timing out
*other* specs. Workers are now capped at three in `playwright.config.ts`, which
is measured rather than guessed: four fails, three does not. The boutique's own
specs run serially within their file for the same reason.

---

## 7. What is not done, and what I got wrong

- **Blender MCP was unavailable.** Reported rather than simulated.
- **No custom IEM models**, by design and by prohibition. See §2.
- **The niche interiors still read a little washed** at the establishing
  distance — the back panels catch more light than I would like, and the cards
  read as small dark rectangles until you approach. More falloff inside the
  recess would help.
- **The hero niche is distinguished by size, position and a slightly warmer
  light only.** That is the restraint the brief asked for, but a viewer who does
  not already know which one is recommended has to be told by a label.
- **Mobile is a recomposition, not a redesign.** It frames the central group
  honestly and all controls are reachable, but a phone-first layout would place
  the overlay as a sheet rather than a column.
- **Four wrong turns on the walnut**, each found only by rendering and looking:
  the whole room rig was behind the wall; the grain ran along the wall's depth
  instead of up the boards; a Wave texture gave fluting, and distorting it
  enough to break the period gave drapery. The answer — stretched noise — is in
  both the Blender shader and the browser's generated texture, with the reasons
  written beside it.
- **The first GLB had no UVs**, so the browser got geometry the grain texture
  could not map to and the wall arrived flat brown.
- **Nothing is committed.** This repository still has zero git commits.
