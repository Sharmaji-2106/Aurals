"use client";

import {
  ARC,
  CARD_SECONDS,
  SEQUENCE_SECONDS,
  SKIP_TO,
  SPEEDS,
  STAGES,
  STAGE_LABEL,
  STAGE_START,
  T,
  type Stage,
} from "@/components/book/contract";
import { editionPages, type BookFeature } from "@/components/book/edition";
import { finaleFrame, type Landing } from "@/components/book/finale";
import type { BookRun } from "@/components/book/run";
import { useBookSound } from "@/components/book/sound";
import { Sources } from "@/components/book/sources";
import { cn } from "@/lib/cn";
import { usePlaybackClock } from "@/lib/playback";
import { Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Three.js and the page artwork are prepared in the browser only: they need a
 * GPU, a device-pixel ratio and the document's fonts, none of which exist on a
 * server.
 */
const BookReveal = dynamic(() => import("@/components/book/book-reveal").then((m) => m.BookReveal), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#080a1b]" />,
});

/**
 * The Listening Edition, played.
 *
 * Two things in one document. Underneath, a real page (`page`): the sample
 * listener's `/match` in the studio, or the listener's own results in their
 * edition. Over it, fixed to the screen, the film: the book opens, its pages
 * turn, and it ends on the spread for the earphone the engine chose. The film
 * then pushes into that earphone's photograph, changes the light to the app's
 * own, and pulls back: and what it pulls back to is the page underneath, whose
 * camera transform and scroll the clock drives until the film is over and
 * hands it to the viewer.
 */
export function EditionPlayer({
  feature,
  run,
  page,
  studio = false,
  onFinished,
}: {
  feature: BookFeature;
  /** Whose numbers the pages print; the sample listener's when omitted. */
  run?: BookRun;
  /** The real page underneath, given the Sound Card's clock. */
  page: (card: { time: number; interactive: boolean }) => ReactNode;
  /** The studio's transport, labels and sources. */
  studio?: boolean;
  /** Called once, when the film has handed the page to the viewer. */
  onFinished?: () => void;
}) {
  const playback = usePlaybackClock<Stage>({
    length: SEQUENCE_SECONDS,
    skipTo: SKIP_TO,
    stages: STAGE_START,
    order: STAGES,
    autoPlay: false,
  });
  const [reduced, setReduced] = useState(false);
  const [mode, setMode] = useState<"loading" | "film" | "page">("loading");
  const [showControls, setShowControls] = useState(false);
  const [sources, setSources] = useState(false);
  // Sound is opt-in: off until asked for, which is also when a browser allows it.
  const [sound, setSound] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const { play, skipTo, pause, seek } = playback;
  useBookSound(playback.time, playback.playing, sound && mode === "film");

  // The film starts when it is ready to play without hitching, not before.
  const handleReady = useCallback(
    (next: "film" | "page") => {
      setMode(next);
      if (next === "film") play();
      else skipTo(SKIP_TO);
    },
    [play, skipTo],
  );

  // A handle for the capture harness: the scene is a pure function of the
  // clock, so parking it at an instant renders exactly what plays there.
  useEffect(() => {
    const host = window as unknown as { __bookSeek?: (seconds: number) => void };
    host.__bookSeek = (seconds: number) => {
      pause();
      seek(seconds);
    };
    return () => {
      delete host.__bookSeek;
    };
  }, [pause, seek]);

  const time = playback.time;
  const finished = time >= SKIP_TO;

  // Escape skips the film, as it would any title sequence.
  useEffect(() => {
    if (mode !== "film" || finished) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") skipTo(SKIP_TO);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, finished, skipTo]);

  /* ---- the film's frame and the page underneath ---- */
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const viewport = useBoxSize(overlay);
  const layer = useRef<HTMLDivElement>(null);
  const edition = useMemo(() => editionPages(feature, run), [feature, run]);
  const landing = useLanding(layer, viewport, time, feature.slug);
  const frame = finaleFrame(time, viewport, edition, landing);
  const pageVisible = mode === "page" || finished || frame.page.visible;

  // Once, when the page has been handed over.
  const handed = useRef(false);
  useEffect(() => {
    if (handed.current || !(finished || mode === "page")) return;
    handed.current = true;
    onFinished?.();
  }, [finished, mode, onFinished]);

  // Nobody scrolls a page they cannot see; the clock does, until it is over.
  useEffect(() => {
    if (finished || mode === "page") return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [finished, mode]);

  // The document's scroll is part of the frame: the card's composition during
  // the film, then the way up to the Sound DNA. Written only when the clock
  // moves, so once the film is over the page is the viewer's to scroll.
  const target = frame.scroll;
  useLayoutEffect(() => {
    if (target === null) return;
    if (Math.abs(window.scrollY - target) > 0.5) window.scrollTo({ top: target, behavior: "instant" });
  }, [target, time]);

  return (
    // Not a <main>: the page underneath is /match, which has its own.
    <div
      className="relative w-full"
      data-edition=""
      data-stage={playback.stage}
      data-time={time.toFixed(3)}
      data-mode={mode}
      data-landed={finished}
    >
      {studio && <h1 className="sr-only">Aurals: the edition</h1>}

      {/* The real page, underneath. */}
      <div
        ref={layer}
        className="origin-top-left"
        style={{
          transform: frame.page.transform ?? undefined,
          visibility: pageVisible ? "visible" : "hidden",
          willChange: frame.page.transform ? "transform" : undefined,
        }}
        aria-hidden={!pageVisible}
        inert={!finished && mode !== "page"}
        data-layer="match"
      >
        {page({
          time: mode === "page" ? CARD_SECONDS : Math.max(0, Math.min(CARD_SECONDS, time - T.card[0])),
          interactive: finished || mode === "page",
        })}
      </div>

      {/* The film, over it. */}
      <div
        ref={setOverlay}
        className="pointer-events-none fixed inset-0 z-[60]"
        // Hidden once the film is over; without a film (reduced motion, no
        // WebGL) it only carries the line that says why, so it stays.
        style={{ visibility: finished && mode === "film" ? "hidden" : "visible" }}
        data-layer="film"
      >
        <BookReveal
          time={time}
          feature={feature}
          run={run}
          still={reduced}
          landing={landing}
          onReady={handleReady}
        />
      </div>

      {/* What this page is, stated plainly, kept out of the way of the film. */}
      {studio && (
        <div className="pointer-events-none fixed bottom-0 left-1/2 z-[70] -translate-x-1/2 p-3 sm:p-4">
          <p className="rounded-full border border-[#D5AD62]/30 bg-[#080a1b]/55 px-2.5 py-1 font-mono text-[9px] tracking-[0.22em] whitespace-nowrap text-[#D5AD62]/85 uppercase backdrop-blur-sm">
            <span className="hidden sm:inline">Development demo · sample listener</span>
            <span className="sm:hidden">Demo · sample listener</span>
          </p>
        </div>
      )}

      {mode === "film" && time < T.theme[1] && (
        <div className="fixed top-4 left-4 z-[70] flex items-center gap-1 sm:top-6 sm:left-6">
          <button
            type="button"
            onClick={() => skipTo(SKIP_TO)}
            className="rounded-full px-3 py-1.5 font-mono text-[9.5px] tracking-[0.24em] text-[#F1E5D1]/55 uppercase transition-colors hover:text-[#F1E5D1]"
          >
            Skip <span className="text-[#F1E5D1]/30">esc</span>
          </button>
          <button
            type="button"
            onClick={() => setSound((on) => !on)}
            aria-pressed={sound}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[9.5px] tracking-[0.24em] text-[#F1E5D1]/55 uppercase transition-colors hover:text-[#F1E5D1]"
          >
            {sound ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
            {sound ? "Sound on" : "Sound"}
          </button>
        </div>
      )}

      {studio && mode !== "loading" && (
        <Controls
          playback={playback}
          film={mode === "film"}
          open={showControls}
          onToggle={() => setShowControls((on) => !on)}
          onSources={() => setSources(true)}
        />
      )}

      <AnimatePresence>
        {sources && <Sources feature={feature} missing={[]} onClose={() => setSources(false)} />}
      </AnimatePresence>
      {/* Lets the page's final frame be told apart from a frame of the film. */}
      <span className="sr-only" aria-live="polite">
        {finished ? "The edition has finished. The page is yours to scroll." : ""}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- measure --- */

/** The size of the box the film fills — the viewport less any reserved gutter. */
function useBoxSize(element: HTMLElement | null) {
  const [size, setSize] = useState({ width: 1440, height: 900 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

/**
 * Where the page's own product photograph is when the product card is
 * composed, and where the Sound DNA section is.
 *
 * Measured from the page itself, never assumed: the card's layout depends on
 * the screen, the fonts and the page's own entrance animations. While the film
 * plays the page is parked (hidden) at the card's scroll position and measured
 * four times a second, without the film's transform on it, so whenever the
 * camera pulls back the numbers are those of the page as it now is.
 */
function useLanding(
  layer: React.RefObject<HTMLDivElement | null>,
  viewport: { width: number; height: number },
  time: number,
  slug: string,
) {
  const [landing, setLanding] = useState<Landing | null>(null);
  const parked = time < T.theme[0];
  // Measured until the page starts to scroll: a skip or a scrub can land on
  // any frame, and the page's own entrance animations may still be settling.
  const active = time < T.scroll[0];
  const finished = time >= SKIP_TO;
  const parkedRef = useRef(parked);
  useEffect(() => {
    parkedRef.current = parked;
  }, [parked]);

  useEffect(() => {
    if (!active) return;
    const run = () => {
      const element = layer.current;
      if (!element) return;
      // The page is only scrolled to the card while it is hidden.
      const next = measure(element, slug, viewport.height, parkedRef.current);
      if (!next) return;
      setLanding((current) => (current && same(current, next) ? current : next));
    };
    const first = requestAnimationFrame(run);
    const id = window.setInterval(run, 250);
    return () => {
      cancelAnimationFrame(first);
      window.clearInterval(id);
    };
  }, [active, layer, slug, viewport.width, viewport.height]);

  // Arriving at the end — by playing through, skipping or with no film at all —
  // the page is measured once more, as it now is, and that is where it rests.
  // Only on arrival: after that the page is the viewer's, and is never moved.
  useEffect(() => {
    if (!finished) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      const element = layer.current;
      const next = element ? measure(element, slug, viewport.height, false) : null;
      if (next) {
        setLanding((current) => (current && same(current, next) ? current : next));
        window.clearInterval(id);
      } else if (tries > 40) window.clearInterval(id);
    }, 120);
    return () => window.clearInterval(id);
  }, [finished, layer, slug, viewport.height]);

  return landing;
}

function same(a: Landing, b: Landing) {
  const close = (x: number, y: number) => Math.abs(x - y) < 0.25;
  return (
    close(a.image.x, b.image.x) &&
    close(a.image.y, b.image.y) &&
    close(a.image.w, b.image.w) &&
    close(a.scroll, b.scroll) &&
    close(a.dna, b.dna) &&
    close(a.origin.x, b.origin.x) &&
    close(a.origin.y, b.origin.y)
  );
}

function measure(layer: HTMLElement, slug: string, viewportHeight: number, park: boolean): Landing | null {
  const art = layer.querySelector<HTMLElement>(`[data-art="${CSS.escape(slug)}"]`);
  // The product's photograph; or, for an earphone without one, the frame its
  // drawing fills, treated as a square image of that size.
  const image = art?.querySelector("img") ?? null;
  const frameOnly = Boolean(art) && !image;
  const section = art?.closest("section");
  // The opening section the page rises to: the Sound Card, or (on a page
  // without one) the Sound DNA and its chart.
  const cardSection = layer.querySelector<HTMLElement>('[data-section="sound-card"]');
  const dnaSection =
    cardSection ??
    layer.querySelector<HTMLElement>('[data-section="sound-dna"]') ??
    layer.querySelector<HTMLElement>('[data-section="your-sound"]');
  const chart = cardSection ?? layer.querySelector<HTMLElement>("[data-dna-chart]") ?? dnaSection;
  if (!art || !section || !dnaSection || !chart) return null;
  if (!frameOnly && (!image || !image.naturalWidth)) return null;

  // Measured as laid out, without the film's camera on it.
  const transform = layer.style.transform;
  layer.style.transform = "none";
  try {
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    // The card composed under the page's sticky header, with a little air.
    const scroll = Math.max(0, Math.round(sectionTop - 96));
    if (park && Math.abs(window.scrollY - scroll) > 0.5)
      window.scrollTo({ top: scroll, behavior: "instant" });
    const y = window.scrollY;

    const target = image ?? art;
    const box = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    const pl = image ? parseFloat(style.paddingLeft) : 0;
    const pr = image ? parseFloat(style.paddingRight) : 0;
    const pt = image ? parseFloat(style.paddingTop) : 0;
    const pb = image ? parseFloat(style.paddingBottom) : 0;
    const cw = box.width - pl - pr;
    const ch = box.height - pt - pb;
    // object-fit: contain
    const nw = image?.naturalWidth || cw;
    const nh = image?.naturalHeight || ch;
    const fit = Math.min(cw / nw, ch / nh);
    const w = nw * fit;
    const h = nh * fit;
    const rect = {
      x: box.left + pl + (cw - w) / 2,
      // In viewport coordinates with the document at `scroll`.
      y: box.top + y - scroll + pt + (ch - h) / 2,
      w,
      h,
    };

    const origin = layer.getBoundingClientRect();
    const chartBox = chart.getBoundingClientRect();
    const chartTop = chartBox.top + y;
    const chartBottom = chartBox.bottom + y;
    // The section from its top if the whole signature fits under it;
    // otherwise just far enough down that the signature is all on screen —
    // never so far that its top slips under the sticky header.
    const dnaTop = Math.round(dnaSection.getBoundingClientRect().top + y);
    const show = Math.round(chartBottom - viewportHeight + 40);
    const dna = cardSection
      ? // The card's section, from its top, just under the sticky header.
        Math.max(0, dnaTop - 64)
      : Math.max(0, Math.min(Math.max(show, dnaTop - 64), Math.round(chartTop - 80)));
    return { image: rect, scroll, dna, origin: { x: origin.left + window.scrollX, y: origin.top + y } };
  } finally {
    layer.style.transform = transform;
  }
}

/* --------------------------------------------------------------- controls --- */

function Pill({
  onClick,
  label,
  icon,
  active,
}: {
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] whitespace-nowrap transition-colors",
        active
          ? "border-[#D5AD62]/55 bg-[#D5AD62]/10 text-ink"
          : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Controls({
  playback,
  film,
  open,
  onToggle,
  onSources,
}: {
  playback: ReturnType<typeof usePlaybackClock<Stage>>;
  film: boolean;
  open: boolean;
  onToggle: () => void;
  onSources: () => void;
}) {
  const { time, playing, speed, stage, progress } = playback;
  return (
    <div className="fixed right-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:right-6 sm:bottom-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="rounded-full border border-hairline-strong bg-[#080a1b]/70 px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-ink-faint uppercase backdrop-blur-md transition-colors hover:text-ink"
      >
        {open ? "Hide controls" : "Controls"}
      </button>
      {open && (
        <div className="flex w-[min(92vw,620px)] flex-col gap-2.5 rounded-2xl border border-hairline bg-[#080a1b]/88 p-3 backdrop-blur-md">
          {film && (
            <div className="flex items-center gap-2.5">
              <span className="numeric w-[58px] shrink-0 text-[10px] text-ink-faint">{time.toFixed(2)}s</span>
              <div className="relative flex-1">
                <input
                  type="range"
                  min={0}
                  max={SEQUENCE_SECONDS}
                  step={0.01}
                  value={time}
                  onChange={(event) => playback.seek(Number(event.target.value))}
                  aria-label="Scrub the sequence"
                  className="relative z-10 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 outline-none [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#D5AD62]"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 my-auto h-1.5 rounded-full bg-[#D5AD62]/45"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className="w-[118px] shrink-0 text-right font-mono text-[9px] tracking-[0.14em] text-[#D5AD62] uppercase">
                {ARC[stage]}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {film && (
              <>
                <Pill
                  onClick={playback.toggle}
                  label={playing ? "Pause" : time > 0 && time < SEQUENCE_SECONDS ? "Resume" : "Play"}
                  icon={playing ? <Pause className="size-3" /> : <Play className="size-3" />}
                  active={playing}
                />
                <Pill onClick={playback.replay} label="Replay" icon={<RotateCcw className="size-3" />} />
                <Pill
                  onClick={() => playback.skipTo(SKIP_TO)}
                  label="Skip to page"
                  icon={<SkipForward className="size-3" />}
                />
                <span className="mx-0.5 h-4 w-px shrink-0 bg-white/10" />
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => playback.setSpeed(value)}
                    className={cn(
                      "numeric h-7 shrink-0 rounded-full border px-2 text-[10.5px] transition-colors",
                      speed === value
                        ? "border-[#D5AD62]/55 bg-[#D5AD62]/10 text-ink"
                        : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
                    )}
                  >
                    {value}&times;
                  </button>
                ))}
                <span className="mx-0.5 h-4 w-px shrink-0 bg-white/10" />
              </>
            )}
            <Pill onClick={onSources} label="Photographs & sources" />
          </div>
          {film && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
              {STAGES.map((value, i) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => playback.goToStage(value)}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[9.5px] whitespace-nowrap transition-colors",
                    stage === value
                      ? "border-[#D5AD62]/55 bg-[#D5AD62]/10 text-ink"
                      : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
                  )}
                >
                  <span className={cn("numeric", stage === value ? "text-[#D5AD62]" : "text-ink-faint/70")}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {STAGE_LABEL[value]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
