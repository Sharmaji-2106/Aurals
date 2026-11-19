"use client";

import {
  ACT_ORDER,
  DRAW_MS,
  DWELL_MS,
  TOTAL_PRELUDE_MS,
  latest,
  numberFrom,
  shortfall,
  stringFrom,
  tally,
  type ActId,
  type Ranked,
  type Run,
} from "@/components/discovery/acts";
import { ResearchFeed } from "@/components/discovery/research-feed";
import { buildEntries } from "@/components/selection/entries";
import { RailAct } from "@/components/discovery/rail-act";
import { ProductArt } from "@/components/results/product-art";
import type { Recommendation } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { quality } from "@/lib/grain/gl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The discovery sequence.
 *
 * It is a presentation layer over a run that is already happening, and it holds
 * no state the backend does not have. Dismiss it at any point and the results
 * underneath are correct and complete — which is why the skip control is
 * always there, and why a run that finished before you arrived is never
 * replayed.
 *
 * Every number on screen comes from an event payload. There is no progress bar,
 * because there is no honest denominator: the engine's work is already done
 * when the sequence starts, and the number of community discussions that exist
 * is not knowable in advance.
 */

const CTA = "Go to your results";

/**
 * How long the community act will wait before handing over anyway.
 *
 * Research is genuinely slow — each search is a real round trip — but it can
 * also stall, and a sequence with no end is a trap however good it looks. The
 * results underneath are already correct and complete, and a run that is still
 * going keeps going: the page polls it, and the community section fills in when
 * it lands. So waiting past this point costs the listener something and gains
 * them nothing.
 */
const BAIL_MS = 180_000;

/** The 3D field, split out of the bundle: it only loads if it will be shown. */
const FieldScene = dynamic(() => import("@/components/discovery/scene/field-scene"), {
  ssr: false,
});

export function Discovery({
  run,
  ranking,
  onDone,
  artLayoutId,
  recommendations,
}: {
  run: Run | undefined;
  ranking: Ranked[];
  onDone: () => void;
  /** Shared with the Spotlight on the results page. See the hero below. */
  artLayoutId?: string;
  /**
   * The ranking in full.
   *
   * The rail shows real candidates travelling through, not the winner alone,
   * and every card's portrait is drawn from its own entry — so the card that
   * travels already shows what it will show on arrival, and the artwork never
   * appears out of nowhere at the destination.
   */
  recommendations?: readonly Recommendation[];
}) {
  const reduced = useReducedMotion();
  // The act is derived from elapsed time and the run, never stored. Storing it
  // would mean syncing two sources of truth in effects, and the one on the
  // server is the real one.
  const [elapsed, setElapsed] = useState(0);
  // Read once, at mount. A run that was already complete when this page opened
  // is a result, not a discovery, and performing it again would be theatre.
  const [wasFinished] = useState(() => Boolean(run?.finished));
  const startedAt = useRef<number>(0);
  const notified = useRef(false);
  const finishedRef = useRef(false);
  const onDoneRef = useRef(onDone);

  // Kept current after every render so the clock below reads fresh values
  // without being restarted each time the run is polled.
  useEffect(() => {
    onDoneRef.current = onDone;
    finishedRef.current = Boolean(run?.finished);
  });

  // Reduced motion gets the findings without the choreography, and an
  // already-finished run gets no prelude at all.
  const prelude = wasFinished || reduced ? 0 : TOTAL_PRELUDE_MS;

  // When the draw began, in the same clock as `elapsed`. Null until the
  // research is in. It is state because the act is derived during render, and
  // a mirror ref because the interval below has to read it without being torn
  // down and rebuilt every time it changes.
  const [drawFrom, setDrawFrom] = useState<number | null>(null);
  const drawFromRef = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (notified.current) return;
    notified.current = true;
    onDoneRef.current();
  }, []);

  // One clock. The tick is a subscription to the passage of time, and the act
  // is computed from it — so a late event, a remount or a slow render can
  // never leave the sequence out of step with the run.
  useEffect(() => {
    startedAt.current = performance.now();
    const id = window.setInterval(() => {
      const since = performance.now() - startedAt.current;
      setElapsed(since);
      const over = since >= prelude;

      // The research is in (or has waited long enough): start the draw.
      if (over && drawFromRef.current === null && (finishedRef.current || since >= prelude + BAIL_MS)) {
        drawFromRef.current = since;
        setDrawFrom(since);
      }

      // The draw is the last thing that happens, so the handover waits for it
      // rather than for the run. Dismissing early still works: `finish` is
      // guarded by the same flag.
      const drawnFor = drawFromRef.current === null ? -1 : since - drawFromRef.current;
      if (drawnFor >= DRAW_MS && !notified.current) {
        notified.current = true;
        onDoneRef.current();
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [prelude]);

  // Escape is always a way out, as it is on the analysis arrival.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const act: ActId = useMemo(() => {
    if (wasFinished) return "done";
    if (reduced) return run?.finished ? "done" : "community";
    if (elapsed < DWELL_MS.sound) return "sound";
    if (elapsed < DWELL_MS.sound + DWELL_MS.catalogue) return "catalogue";
    if (elapsed < TOTAL_PRELUDE_MS) return "ranking";
    if (drawFrom === null) return "community";
    return elapsed - drawFrom < DRAW_MS ? "draw" : "done";
  }, [drawFrom, elapsed, reduced, run?.finished, wasFinished]);

  // The rail, built from the real ranking. The winning card's portrait carries
  // the shared id, so the artwork the listener watches settle is literally the
  // artwork that arrives on the results page rather than a copy of it that
  // happens to look the same.
  const rail = useMemo(
    () =>
      buildEntries(recommendations ?? [], (rec, isWinner) =>
        isWinner ? (
          <motion.div layoutId={artLayoutId} data-art={rec.slug} className="absolute inset-0">
            <ProductArt rec={rec} className="p-[6%]" intensity={0.9} />
          </motion.div>
        ) : (
          // The candidates are still. Nine drifting canvases cost more than
          // the whole rest of the sequence and nobody is studying the ones
          // sweeping past.
          <ProductArt rec={rec} className="p-[6%]" intensity={0.78} animate={false} />
        ),
      ),
    [recommendations, artLayoutId],
  );

  const counts = useMemo(() => tally(run), [run]);
  const measured = numberFrom(latest(run, "catalogue_loaded"), "measured");
  const dims = numberFrom(latest(run, "profile_ready"), "dimensions");
  const recommender = stringFrom(latest(run, "candidates_scored"), "recommender");
  const winner = ranking[0];
  const scored = useMemo(() => ranking.map((r) => ({ slug: r.slug, mean: r.mean })), [ranking]);
  // The field opens during the catalogue act and settles once the ranking
  // is on screen, so the movement tracks the story rather than a clock.
  const settled = act === "sound" || act === "catalogue" ? 0 : 1;
  const scene = !reduced && measured != null && quality() !== "low";
  const note = shortfall(run);

  if (act === "done") return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-50 overflow-hidden bg-[radial-gradient(120%_80%_at_50%_110%,#2a1236_0%,#140d24_45%,#0b0913_100%)]"
      role="dialog"
      aria-label="Discovering your recommendations"
    >
      {/* A wash of light that warms as the sequence moves from analysis to
          community, so the room itself changes rather than the cards swapping.
          It lifts for the draw, which brings its own studio and its own key
          light — two sets of lighting over one another is what made the rail
          look flat the first time it ran here. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-[2000ms]"
        style={{
          background:
            act === "community"
              ? "radial-gradient(90% 70% at 78% 18%, rgb(61 139 255 / 0.16), transparent 62%)"
              : "radial-gradient(90% 70% at 30% 24%, rgb(255 92 138 / 0.16), transparent 62%)",
          opacity: act === "draw" ? 0 : 1,
        }}
      />

      {/* The field itself, behind everything. Skipped entirely on a weak
          device or under reduced motion — there is no half-speed 3D fallback,
          because a stuttering scene is worse than none.

          It is unmounted for the draw rather than faded out. Left in the tree
          at zero opacity it went on rendering a full WebGL scene every frame
          underneath the rail, which is invisible work and most of why the rail
          stuttered in the product but not in its own studio. */}
      {scene && act !== "draw" && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-[1600ms] ease-out"
          // The field is the catalogue. Once the story has moved past it to
          // what owners say, it recedes rather than competing with the words
          // in front of it.
          style={{ opacity: act === "community" ? 0.22 : 1 }}
        >
          <FieldScene measured={measured ?? 0} scored={scored} settled={settled} />
        </div>
      )}

      {/* A scrim under the reading column, so type never sits on a bright
          sphere. Left-weighted, so the field still reads on the right. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          background:
            "linear-gradient(100deg, rgb(8 8 10 / 0.92) 0%, rgb(8 8 10 / 0.72) 34%, transparent 62%)",
          opacity: act === "draw" ? 0 : 1,
        }}
      />

      {/* The draw. The whole frame, because this is the moment the sequence has
          been building to and a reading column beside it would only compete.

          The artwork inside the winning card carries the same id as the
          Spotlight's artwork on the results page. The card finishes its turn
          exactly square to the viewport, so the box motion measures when the
          overlay closes is the card's true screen rectangle — which is what
          lets the thing the listener just watched being revealed travel into
          the page rather than being replaced by a copy of itself. */}
      {act === "draw" && winner && rail.length > 0 && (
        <motion.div
          key="draw"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="absolute inset-0"
        >
          <RailAct entries={rail} />
        </motion.div>
      )}

      <div className="shell relative flex h-full flex-col py-7 sm:py-9">
        {/* Where we are. Named acts, not a percentage. */}
        <div className="flex items-center justify-between gap-6">
          <ol className="flex items-center gap-2 sm:gap-3">
            {ACT_ORDER.filter((a) => a !== "done").map((a, i) => {
              const at = ACT_ORDER.indexOf(act);
              const state = i < at ? "past" : i === at ? "now" : "ahead";
              return (
                <li key={a} className="flex items-center gap-2 sm:gap-3">
                  <span
                    className={cn(
                      "h-px transition-all duration-1000 ease-(--ease-out-expo)",
                      state === "ahead" ? "w-4 bg-white/15 sm:w-7" : "w-7 sm:w-12",
                      state === "past" && "bg-white/35",
                      state === "now" && "bg-ember",
                    )}
                  />
                  <span
                    className={cn(
                      "font-mono text-[9px] tracking-[0.22em] uppercase transition-colors duration-700 sm:text-[10px]",
                      state === "now" ? "text-ink" : state === "past" ? "text-ink-muted" : "text-ink-faint",
                      // On a phone only the act in hand is named; the rest are marks.
                      state !== "now" && "hidden sm:inline",
                    )}
                  >
                    {ACT_LABEL[a]}
                  </span>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={finish}
            className="h-9 shrink-0 rounded-full bg-white/[0.03] px-4 text-[12px] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.13)] backdrop-blur-md transition-[background-color,box-shadow,color] duration-500 hover:bg-white/[0.07] hover:text-ink hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.28)]"
          >
            {CTA}
          </button>
        </div>

        <div className="relative mt-10 min-h-0 flex-1 sm:mt-[9vh]">
          <AnimatePresence mode="wait">
            {act === "sound" && (
              <Panel key="sound" eyebrow="Your sound">
                <Headline>
                  Your listening has a <em className="voice text-sunset">shape</em>.
                </Headline>
                <Line>
                  {dims
                    ? `${dims} dimensions, read from your answers and your music, drawn as one target curve.`
                    : "Your target curve is drawn from your answers and your music."}
                </Line>
              </Panel>
            )}

            {act === "catalogue" && (
              <Panel key="catalogue" eyebrow="The catalogue">
                <Headline>
                  <Figure>{measured ?? "—"}</Figure> measured earphones, compared against{" "}
                  <em className="voice text-sunset">your</em> curve.
                </Headline>
                <Line>
                  Every one of them has a published frequency-response measurement. None was excluded for
                  being unfashionable, and none was added for being popular.
                </Line>
              </Panel>
            )}

            {act === "ranking" && (
              <Panel key="ranking" eyebrow="The ranking">
                <Headline>
                  Every one of them is now <em className="voice text-sunset">in order</em>.
                </Headline>
                {winner ? (
                  <>
                    <Line>
                      Each earphone has been scored against your personal target by{" "}
                      {recommender ?? "the preference model"}, and placed in rank order. The strongest is held
                      back for the draw.
                    </Line>
                    <Line>
                      First, the part measurements cannot answer: what the people who own the ones at the top
                      actually say about living with them.
                    </Line>
                  </>
                ) : (
                  <Line>The ranking is still being read.</Line>
                )}
              </Panel>
            )}

            {act === "community" && (
              <Panel key="community" eyebrow="The community" wide>
                <Headline>
                  Now, what do people who <em className="voice text-sunset">own</em> them say?
                </Headline>
                <Line>
                  Measurements say what an earphone does. They do not say what it is like to live with.
                  Searching real conversations for that.
                </Line>
                <ResearchFeed run={run} counts={counts} ranking={ranking} note={note} />
              </Panel>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

const ACT_LABEL: Record<Exclude<ActId, "done">, string> = {
  draw: "The draw",
  sound: "Your sound",
  catalogue: "Catalogue",
  ranking: "Ranking",
  community: "Community",
};

function Panel({
  children,
  eyebrow,
  wide = false,
}: {
  children: React.ReactNode;
  eyebrow: string;
  wide?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -18, filter: "blur(8px)" }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex h-full flex-col", wide ? "max-w-none" : "max-w-4xl")}
    >
      <p className="eyebrow eyebrow-rule">{eyebrow}</p>
      {children}
    </motion.section>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return <h2 className="marquee mt-6 max-w-4xl text-[clamp(2.3rem,5.8vw,5.5rem)]">{children}</h2>;
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-muted sm:text-[17px]">{children}</p>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return <span className="numeric tabular-nums">{children}</span>;
}
