# Decisions

Short records of choices that shape the codebase. Newest last.

### 1. Modular monolith, one database

A single FastAPI app and a worker share one Python package and one PostgreSQL database.
Module boundaries (`analysis` never touches the DB or HTTP; `music` owns ingestion;
`recommend` sees only schemas) give most of the benefits of services without the
operational cost. Revisit when the analysis workload needs to scale independently of
the API. The worker is already a separate process.

### 2. PostgreSQL job queue instead of Redis + Celery/RQ

Jobs are rows claimed with `SKIP LOCKED`. Enqueueing happens in the same transaction as
the records being processed, so there's no "row committed, job lost" gap, and there is
one less service to run. RQ doesn't run natively on Windows, and throughput needs are
tracks per minute. The handler registry hides the backend if this ever changes.

### 3. PyAV for decoding, no system ffmpeg

PyAV bundles FFmpeg and decodes Opus/AAC straight to NumPy, which keeps setup to
`uv sync`. yt-dlp downloads the best audio-only stream without post-processing.

### 4. Anonymous-first sessions

The first-run experience asks only for a name. A random 256-bit token lives in an
HttpOnly, SameSite=Lax cookie, and only its SHA-256 hash is stored. State-changing
requests must carry an `x-auralis-client` header, which closes CSRF without token
plumbing. Email or passkey sign-in can later attach to the same user row.

### 5. User input never reaches yt-dlp

URLs are parsed against an allow-list and reduced to `(kind, id)`. yt-dlp only sees
canonical URLs that we build ourselves, and extraction is restricted to the YouTube
extractors. This rules out SSRF and surprises from yt-dlp's other extractors.

### 6. Analyses are a shared cache keyed by track and analyzer version

Features of a public recording are not personal data, and analysing a popular song once
is much cheaper. The link between a user and a track stays in user-owned tables and is
deleted with the account.

### 7. Band levels relative to the midrange, per octave

Band power is expressed per octave relative to 500 Hz–2 kHz, so pink noise reads 0 dB
everywhere. The frequency-response pipeline normalises to the same range. Music and
IEMs are therefore described on comparable axes.

### 8. Descriptors calibrated on a real, disclosed corpus

Instead of hand-picking constants, descriptor centres and scales come from a
30-track, multi-genre corpus. The track list is committed and the command is
reproducible. It is labelled provisional; a larger corpus will replace it.

### 9. Music is weak evidence for preference (superseded by 16)

What someone listens to is not what they want their earphones to do to it. Music
evidence was compressed towards neutral and capped in weight, and answers dominated.
In practice this made the music, the product's core evidence, nearly invisible in the
result (a 106-song library moved no band by more than 0.3 dB). See 16.

### 10. Curation keeps proportions

Duplicates count once and atypical tracks are down-weighted (never silently dropped),
but clusters are *not* equalised: a library that is 80 % electronic should look like it.
Clusters stay visible because the median of a bimodal library describes neither mode.

### 11. Server-driven questionnaire

Questions, options and their versions live in the backend next to the mapping that
interprets them. The client renders whatever the API returns, so wording and scoring
cannot drift apart.

### 12. Dark-only visual design

The product is about listening, and its data visualisations read best on a near-black
canvas. Colour is reserved for meaning: the spectral scale maps frequency to hue and
appears only on audio data.

### 13. Dev supervisor instead of uvicorn `--reload`

On Windows, uvicorn's reloader restarts its child with console Ctrl+C events, which never
reach background processes. `scripts/dev.py` watches the sources itself and restarts
whole process trees (API and worker). The same code path works on macOS and Linux.

### 14. One line as the product's visual language

Instead of a separate chart per screen, every stage of the journey draws the same
object: a spectral line on a shared log-frequency stage (`SignatureStage`). Songs are
traces, the listening signature is their median, preferences bend it, confidence is its
width, and an earphone will be a second line beside it. This keeps the story legible
(music → signal → signature → preference → your sound → match), reuses one tested
component, and keeps colour meaningful (frequency only). Illustrations on the landing
page use synthetic curves and are labelled as such. Everywhere else the line is real data.

### 15. Live preview through the real fusion model

The questionnaire shows answers reshaping the curve by calling
`POST /api/sound-profile/preview`, which runs the same fusion code as the saved profile
without storing anything. A client-side approximation would have been faster to build
but could drift from what the profile actually says.

### 16. Music anchors the profile; answers refine it (`sound-profile/2`, superseded by 20)

What someone actually plays is behavioural evidence; answers are stated preference.
The music sets the anchor for everything it can measure, as strongly as its own
evidence allows, and the answers move each value within the room the music leaves
uncertain. There is deliberately no fixed music/answers percentage: any such number
would be invented. The balance follows from evidence per dimension (song count,
consistency, codec coverage, directness of the question). Things music can't reveal
(treble tolerance, priorities) rest on answers alone rather than on weak proxies.

The remaining assumptions (content indicates a tonal tendency; the answers' room is
`1 − music strength`) are heuristics isolated in `sound_profile/fusion.py`, so a model
fitted on real outcomes (feedback on earphones) can replace them. When music and
answers point opposite ways the profile says so instead of averaging the conflict away.

### 17. Evidence in words, not confidence percentages

The internal certainty is a heuristic, so it is never shown as a number. Each value
carries a `basis` (music support, answer support, agreement), shown as a short phrase
("Strong music evidence", "Music evidence, refined by you", "Your music and answers
disagree", "From your answers") with a 0–3 dot level, and as the width of a range that
always spans what each source alone suggests. Source shares stay in the API for
provenance but are not displayed as importance.

### 18. Model upgrades rebuild, never rewrite

Sound profiles are immutable. When the latest one was built by an older model version,
reading it builds a new row from the same stored music profile and answers; the old row
is kept, so earlier results remain inspectable.

### 19. The Harman in-ear target is the reference, and targets are rig-specific

Preference offsets and IEM features are expressed against the Harman in-ear 2019 target
(Olive et al.), the best-supported account of what most listeners prefer. It was
defined on an IEC 60318-4 coupler, so only measurements from that rig family are
compared with it; mixing fixtures would compare numbers that don't mean the same thing.

### 20. A Bayesian personal model with named assumptions (`sound-profile/3`)

Research (Phase 2) supports a population target with individual variation mainly in
bass and treble level, but nothing links a person's library to their preferred tuning.
The model therefore makes that link one explicit parameter (ρ), takes the population
spread from Harman's work, the answer reliability from the single-item literature, and
lets the posterior decide the balance per dimension. Unvalidated values are labelled and
swept in the evaluation instead of being hidden.

### 21. Score with the published preference model

IEMs are ranked with the Olive et al. in-ear predicted-preference model (r = 0.91 in the
original study), reproduced exactly (r = 0.9998 against AutoEq's published scores).
Applying it to a personal target is an extension and labelled as one. A simpler band-RMS
rule agrees on only about half of the top 10, which is why the validated model is used.

### 22. Rank by expected rating over the listener's uncertainty

The personal target is a distribution, so each IEM is scored over posterior draws and
ranked by the mean, with a 10–90 % range. With no evidence this is close to the
published ranking (Kendall τ 0.96). IEMs good across plausible targets rise; ones that
only fit a narrow guess don't.

### 23. External data is fetched, pinned and attributed, not committed

Measurements belong to their authors. They are downloaded from a pinned AutoEq commit
into a git-ignored cache, and every stored row names its source, rig, licence note and
path. Prices must come with a source and date or they are refused; none were verifiable
in Phase 2, so budgets are flagged rather than applied.

### 24. No learned model until there is outcome data

There are no user–IEM outcomes to train or validate a recommender on, and no evidence
linking music embeddings to preferred tuning. Unsupervised analysis is used where it
answers a real question: PCA shows a bass shelf and a tilt explain 71 % of how measured
tunings vary, supporting a small parametric personal target. The next learned
component is estimating ρ and r from feedback on real IEMs.

### 25. Community evidence is retrieved by a job, into the tables reviews already use

Research runs in `research.community` and writes Reddit discussions into
`iem_review_sources` / `iem_review_claims` with `kind="reddit"`, beside the
hand-gathered publication reviews. One reader and one API serve both, the existing
`(iem_id, url)` constraint makes a re-run idempotent, and `tagged_by` already records
who judged each passage — so a person's reading and a model's stay distinguishable
without a parallel schema. Retrieval never happens in a page request: a single search
takes roughly 23 seconds, measured.

Nothing retrieved touches the ranking. That remains measured response against the
listener's target, and the interface says so where a reader would otherwise assume
otherwise.

### 26. Reddrix, chosen with its costs on the record

Reddit's Data API was the alternative; its current access terms could not be verified
from this environment, as every reddit.com and redditinc.com page refused automated
fetching. The project owner chose Reddrix instead, after review.

What that means is written down rather than left implicit. Reddrix is a scraper. Its
own documentation states that it scrapes New Reddit's HTML and internal endpoints
"protected by Cloudflare and reCaptcha Enterprise", that Reddit's JSON endpoints are
"now behind login walls", and that its stealth mode's "random mouse movements
constantly generate reCaptcha Enterprise clearances". It rotates proxies to avoid
blocks and says nothing about Reddit's terms, robots.txt or rate limits. Retrieval
therefore goes through defences Reddit put up to prevent it.

Three consequences are built in rather than trusted to discipline: the provider
defaults to `none`, so a fresh checkout scrapes nothing; stealth and proxies are
separate switches that also default off; and `reddrix` is an optional dependency, so a
default install does not even acquire it. It sits behind `RedditProvider`
(`research/provider.py`) so it can be replaced without touching the job, the schema or
anything above them.

Observed in use: post search is reliable at roughly 11–23 s per query, and comment
retrieval is not — identical requests returned ten comments, then none, with no error
raised. Silence is therefore never reported as "no replies": the posts carry their own
comment counts, and a run that expected replies and received none records
`comments_unavailable` and says so on screen.

### 27. Progress is committed rows, not a stream

The discovery sequence is driven by `research_events`, one committed row per step, polled
the way the music pipeline already is. There is no socket and no event stream in this
project, and adding one would buy less than this does: a refresh mid-run replays exactly
what happened, a crash leaves every finished step on disk, and a second tab sees the same
run. The analytical stages are emitted as the burst they genuinely are — ranking 203
earphones takes about half a second — and the sequence paces its *reading*, never
pretending work is still under way.

### 28. The reveal is DOM, because it has to become the page

The Final Draw is built from DOM elements and compositor transforms, not WebGL, and
the reason is not cost. The winning card has to arrive at the exact place the
recommendation occupies on the results page, as the same element, with its layout
morphing on the way. A canvas cannot become an HTML hero; a `div` can. Everything else
followed — the card is gradients and shadows rather than materials, and its thickness is
a solved box-shadow offset on nineteen cards and a real extrusion on the one that turns.

The card finishes its turn by applying the exact inverse of the stage's tilt, so it is
parallel to the viewport at the moment of handover. That is what makes the measurement
faithful: a bounding box only describes a rectangle that is square to the screen.

It also avoided repeating a failure. The concept this replaced was a WebGL cascade that
looked right and ran at 1.9 FPS. There is no render target here at all, and the sequence
holds 60 FPS.

A measurement note worth keeping, because it cost hours: Playwright's bundled Chromium
falls back to SwiftShader and rasterises every frame on the CPU, where this scene reads
in the twenties. Check `WEBGL_debug_renderer_info` *before* optimising against a frame
rate. `playwright.gpu.config.ts` exists to get a number that means something, and the
perf spec now reads the renderer and picks its threshold accordingly.

Full write-up in `docs/final-draw.md`.

### 29. The boutique displays measurements, because there are no photographs

`/boutique-studio` puts the catalogue in a lit walnut display wall. It does not show
earphones. All 203 were imported from AutoEq measurement files, which carry no images,
and inventing the appearance of real hardware is the one thing this project will not do.

So each niche holds a specimen card with that earphone's own measured frequency response
engraved into it — real geometry, catching real light, from the measurement the
recommendation was actually computed from, credited to whoever took it. A measured
response is a truer likeness of how something sounds than a photograph of a shell, and it
is the only likeness Auralis honestly has.

The environment is modelled in Blender and exported as geometry only. Procedural shaders
do not survive glTF, so the browser rebuilds every material by name and generates the
walnut grain into one 512px canvas tile; baking the shader to textures would have cost
several megabytes to say the same thing. Text stays in the DOM rather than being baked to
meshes, so it can be selected, read aloud and stay crisp.

The scene renders on demand — zero draw calls while idle, verified by patching
`drawElements` rather than by assertion — and about 50 fps while the camera moves.

Four wrong turns on the timber are recorded in `docs/boutique.md`, because each was only
found by rendering the scene and looking at it, and the same mistakes are available to
anyone who edits the shader next.

### 30. The reveal is a rail of cards, and it is 2.5D

The production recommendation reveal is the Selection Rail: nine cards crossing a dark
studio, decelerating until the engine's top result rests exactly in the centre. The
3D boutique and the domino cascade before it are kept as working studio routes and are
no longer on the path a listener takes.

Two things make it cheap and exact. The rail travels once, over one eased span, so there
are no handovers between animations to drift at — and `REST_OFFSET` is defined as the
value that puts the winning card at x = 0, so the landing is constructed rather than
approximated. A card's scale, opacity, lift and turn are read continuously from its
distance to the centre, which is what makes a card swell as it sweeps through and keeps
the rail from reading as a row of progressively smaller rectangles.

It is DOM and CSS transforms, not WebGL: 69 elements holding 57 fps under *software*
rasterisation, where the 3D boutique managed about 5. The same decision also keeps the
shared-element handoff into `Spotlight` intact, because the artwork that travels is an
ordinary element motion can measure and morph.

Only the chosen card quotes a number. A rail of scores would turn a curated sequence
into a leaderboard, which is not what the sequence means.

Full write-up in `docs/selection-rail.md`.

### 31. Quote labelling runs on a chain of models, not a model

Community quotes are grouped by topic and stance by an LLM, and the provider is now
chosen rather than assumed: Google when its key is present, Anthropic otherwise, and
"none" when a provider is named but unconfigured — so an installation that picked one on
purpose is told its key is missing rather than quietly getting the other.

The chain is not belt and braces. Asking six Google models the same question on this key:
three flash models answered 503 "currently experiencing high demand", `gemini-2.5-flash`
answered 404 "no longer available to new users", and both lite models answered correctly
in 180 tokens. The failures are per-model and they move around, so a client holding one
model name loses a run's labelling on an ordinary day and breaks outright the next time a
model is retired. A 400 is treated differently from a 503: that is our request, not their
capacity, and the next model would reject it identically.

The request is plain `urllib` against a `responseSchema` with enums on both label fields,
so a topic outside the vocabulary cannot come back at all. No second vendor SDK was added
to send one JSON body.

Everything the earlier rule required still holds: the model only ever narrows, quotes
travel verbatim, and `tagged_by` records the model that actually answered — which, with a
fallback chain, is information a reader now genuinely needs.

### 32. The book's last page is one SVG, printed twice

The book reveal (`/book-studio`, `docs/book-reveal.md`) ends with the camera flying into
a page until the paper fills the screen, and that page becoming the interface. A handoff
like that is only invisible if the last 3D frame and the first DOM frame are the same
picture, and two renderers of one layout never are: a canvas painter and an HTML page
disagree about baselines, letter-spacing and crops by a pixel or two.

So each page is a single SVG. For the 3D leaf it is rasterised with its fonts and
photographs embedded (an SVG drawn as an image cannot reach the document's); for the DOM
the same markup is inlined and rendered by the same font files, declared under their own
family names so next/font's hashed subsets cannot drift from them. The camera's final
pose is derived from the DOM layout rather than the other way round, and lighting on the
two final pages is mixed out over the last second so the 3D frame shows the artwork's
exact colours.

Measured in the browser: the right page lands at zero offset, the left page (which lies
a centimetre lower in the book) at zero offset after it is placed by depth and drape, and
the residual difference is about 2/255 of antialiasing. A unit test projects the page's
corners through the final camera at five viewport sizes and checks them against the DOM
rectangle.

The book's geometry is built in three.js, not modelled in Blender, because every part of
it moves — the hinge flexes, the spine rolls, each leaf bends — and a leaf is a chain of
rigid segments, so it can bend but never stretch. Its surfaces don't move, so they are
generated once in Python (`design/book/make_textures.py`) at a physical scale.

### 33. The room is baked in Blender; the ending is the DOM

The edition's environment (`docs/book-reveal.md` §2) is a cyclorama built and
lit in Blender and baked: its horizon glow, the spill of that glow across the
floor and the fins back-lit against it are global illumination, computed once
by Cycles instead of approximated per frame. The browser gets the wall and fins
with their light baked in, a lightmap under a live floor (so the book's key and
shadows stay real-time), and an HDR of the room from the book's position for
reflections. About 2.6 MB in all.

The ending — macro push, isolation, pullback into the recommendation page — is
done in the DOM rather than in 3D. A camera perpendicular to a flat page that
dollies toward it sees a pure scale, so nothing is lost by doing it as a
transform, and the type and photograph stay at native sharpness. The product
is the one element that survives every stage: printed on the page, swapped for
a registered cutout during the push, isolated, and placed in the page's left
column, where the interface's camera starts with it exactly on the spread's.

### 34. The edition lands on the real `/match`, for the listener it was printed for

The edition used to end on a recommendation page of its own. That page was a
second results surface: it looked like `/match` without being it, and every
change to `/match` would have had to be made twice. It is gone. The film now
pulls back onto `/match`'s own component tree (`components/match/results.tsx`,
moved out of the route unchanged so both can render it).

Whose `/match`? The book is printed for one listener — the "Neon Odyssey"
playlist — and its last spread names that listener's earphone and rating. In
the local database most listeners' first match is a different earphone, so
landing on the *viewer's* page would show a product other than the one the
camera just pushed into. The studio therefore renders the real page for the
sample listener: the engine's actual output, captured through the product's
own API by `design/book/capture_sample_match.py` (which creates an anonymous
account, analyses the playlist, saves what `/match` reads and deletes the
account again). It runs in a query cache of its own, so it can never read or
change the viewer's account; on it, saving stays local and the delete-account
control is not offered.

The handover is registration, not resemblance. Nova's catalogue photograph is
now the same pixels as the book's cutout (a matte of Truthear's photograph,
imported through `data/iem-images`), so at the macro the page is transformed
until its photograph sits exactly under the overlay's, the overlay dissolves,
and the pullback eases that transform to none. The page measures itself
rather than being assumed; a test asserts the two images coincide to within
1.5 px in the browser, and a unit test checks the transform maths exactly.

Production — the edition on `/match` for the viewer's own result — needs
photography for whichever earphone that is; most of the catalogue has none.

### 35. The terrace replaces the studio

The cyclorama (#33) did not read as a place. The edition is now set on an
oceanfront terrace at sunset, built in Blender (`design/book/build_terrace.py`):
everything kilometres away — sky, sun, sea, the coast — is one panorama drawn as
a backdrop at infinity, softened as a lens focused on the book would soften it;
the near terrace (floor, glass balustrade, villa, canopy) is geometry with its
light baked; the whole terrace seen from the book is the environment it
reflects. The table is made live in three.js, because its smoked glass must
reflect the book as the cover lifts: a mirrored camera draws only the book's
layer into a texture the glass samples. The book's own frame is fixed by its
ending, so the terrace turns about the table instead (`TERRACE_TURN`) to put
the sun off the book's front-left corner.
