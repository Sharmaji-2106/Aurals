"use client";

import { BandRail } from "@/components/signature/band-rail";
import {
  SignatureStage,
  StageBand,
  StageLine,
  StageReference,
  StageTraces,
} from "@/components/signature/stage";
import { Lines, Reveal } from "@/components/site/reveal";
import { BAND_COLOR, type BandKey } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ILLUSTRATION_FREQS as F,
  MATCH_FIT,
  MEASURED,
  MUSIC,
  PREFERENCE,
  SONGS,
  SPREAD,
} from "./illustration";

const CHAPTERS = [
  {
    key: "music",
    label: "Listen",
    stage: "Song traces",
    title: "Every song leaves a trace.",
    body: "Paste the songs and playlists you actually play. AURALS measures the audio itself: how each song spreads its energy from sub-bass to air.",
  },
  {
    key: "signature",
    label: "Understand",
    stage: "Listening signature",
    title: "Traces become your signature.",
    body: "Duplicates count once, oddities are down-weighted, and the rest fold into one line: the typical shape of what you listen to. That line is the foundation of your sound.",
  },
  {
    key: "preference",
    label: "Refine",
    stage: "Refined by you",
    title: "You fine-tune what it found.",
    body: "A few quick questions confirm or adjust the line where your music is less certain, and tell AURALS what music can't show: how bright highs feel to you, and what you value most.",
  },
  {
    key: "match",
    label: "Match",
    stage: "Measured match",
    title: "And we find the earphones that draw it.",
    body: "Measured frequency responses, compared band by band. Every match, and every mismatch, explained.",
  },
] as const;

const lower = MUSIC.map((v, i) => v - SPREAD[i]);
const upper = MUSIC.map((v, i) => v + SPREAD[i]);

function JourneyStage({ chapter }: { chapter: number }) {
  const songs = chapter === 0 ? SONGS : SONGS.map((s) => ({ id: s.id, values: MUSIC }));
  return (
    <div className="glass relative flex h-full flex-col overflow-hidden rounded-[1.75rem] px-5 pt-5 pb-4 sm:px-8 sm:pt-7 sm:pb-6">
      {/* The plate's own light: warm where the bass sits, following the chapter. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/3 -left-1/4 size-[70%] rounded-full blur-3xl transition-opacity duration-1000"
        style={{
          background: "radial-gradient(closest-side, rgb(255 122 89 / 0.2), transparent)",
          opacity: chapter === 0 ? 0.6 : 1,
        }}
      />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="numeric text-[10px] tracking-[0.2em] text-ember">0{chapter + 1}</span>
          <AnimatePresence mode="wait">
            <motion.p
              key={chapter}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
              className="eyebrow text-ink-muted"
            >
              {CHAPTERS[chapter].stage}
            </motion.p>
          </AnimatePresence>
        </div>
        <span className="numeric text-[10px] tracking-wider text-ink-faint uppercase">Illustration</span>
      </div>
      <SignatureStage
        height="100%"
        domain={[-0.75, 1.15]}
        label="Illustration of music turning into a sound profile"
        className="relative mt-4 min-h-0 flex-1"
      >
        <StageReference value={-0.1} />
        <StageTraces freqs={F} traces={songs} opacity={chapter === 0 ? 0.6 : chapter === 1 ? 0.1 : 0} />
        {chapter >= 1 && chapter < 2 && <StageBand freqs={F} lower={lower} upper={upper} opacity={0.16} />}
        {chapter === 2 && (
          <StageBand
            freqs={F}
            lower={MUSIC.map((m, i) => Math.min(m, PREFERENCE[i]))}
            upper={MUSIC.map((m, i) => Math.max(m, PREFERENCE[i]))}
            opacity={0.22}
          />
        )}
        {chapter >= 2 && (
          <StageLine
            series={{ freqs: F, values: MUSIC }}
            variant="white"
            glow={false}
            width={1.5}
            opacity={0.6}
          />
        )}
        {chapter >= 1 && (
          <StageLine series={{ freqs: F, values: chapter >= 2 ? PREFERENCE : MUSIC }} draw={chapter === 1} />
        )}
        {chapter === 3 && (
          <StageLine series={{ freqs: F, values: MEASURED }} variant="measured" glow={false} draw />
        )}
      </SignatureStage>
      <BandRail
        className="relative mt-2"
        render={(key: BandKey) =>
          chapter === 3 ? (
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              className="mt-1.5 h-1 w-3/4 origin-left rounded-full"
              style={{ background: BAND_COLOR[key], opacity: 0.2 + 0.8 * MATCH_FIT[key] ** 3 }}
              title={`Fit ${Math.round(MATCH_FIT[key] * 100)}%`}
            />
          ) : null
        }
      />
      <AnimatePresence>
        {chapter === 2 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-5 top-16 flex justify-between text-[11px] sm:inset-x-8 sm:top-20"
          >
            <span className="rounded-full bg-canvas/80 px-2.5 py-1 text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.13)]">
              + weight down low
            </span>
            <span className="rounded-full bg-canvas/80 px-2.5 py-1 text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.13)]">
              − bite up top
            </span>
          </motion.div>
        )}
        {chapter === 3 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute top-16 right-5 flex flex-col items-end gap-1.5 text-[11px] sm:top-20 sm:right-8"
          >
            <span className="flex items-center gap-2 text-ink-muted">
              <span className="w-5 border-t border-dashed border-ink" /> measured earphone
            </span>
            <span className="flex items-center gap-2 text-ink-muted">
              <span className="h-0.5 w-5 rounded bg-linear-to-r from-ember to-band-air" /> your sound
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Journey() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="journey" className="relative scroll-mt-10">
      <div className="shell">
        <div className="grid grid-cols-1 items-end gap-x-16 gap-y-8 pt-28 sm:pt-44 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow eyebrow-rule text-ink-muted">How it works · Sunset</p>
            <h2 className="marquee mt-6 text-[clamp(3.2rem,7.6vw,7.75rem)]">
              <Lines onView>
                <>From your music</>
                <>
                  to <em className="voice text-sunset">your</em> sound,
                </>
                <>drawn as one line.</>
              </Lines>
            </h2>
          </div>
          <Reveal delay={0.2}>
            <p className="lede max-w-sm lg:pb-3">
              Four steps, one picture. The same line is carried through all of them, so you can watch it turn
              from songs into a sound.
            </p>
          </Reveal>
        </div>

        <div className="relative mt-10 grid grid-cols-1 gap-x-20 sm:mt-16 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="sticky top-16 z-10 -mx-5 h-[46svh] bg-canvas/90 px-5 pt-4 pb-4 backdrop-blur-sm sm:-mx-10 sm:px-10 lg:top-[14vh] lg:mx-0 lg:h-[72vh] lg:self-start lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:backdrop-blur-none">
            <JourneyStage chapter={active} />
          </div>
          <ol className="relative">
            {CHAPTERS.map((chapter, i) => (
              <li
                key={chapter.key}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-index={i}
                className={cn(
                  "flex min-h-[64svh] items-end pb-10 lg:pb-0",
                  // The first chapter starts level with the plate it describes;
                  // the rest pass its centre as they scroll.
                  i === 0 ? "lg:min-h-[62vh] lg:items-start lg:pt-[9vh]" : "lg:min-h-[76vh] lg:items-center",
                )}
              >
                <div
                  className={cn(
                    "transition-[opacity,transform] duration-1000 ease-(--ease-out-expo)",
                    active === i ? "opacity-100" : "translate-y-2 opacity-20",
                  )}
                >
                  <p className="flex items-center gap-4">
                    <span
                      className="marquee text-[clamp(4rem,7vw,6.5rem)] leading-none text-transparent"
                      style={{ WebkitTextStroke: "1.2px rgb(255 160 125 / 0.55)" }}
                      aria-hidden="true"
                    >
                      0{i + 1}
                    </span>
                    <span className="flex flex-col gap-1.5">
                      <span className="eyebrow text-ink-muted">{chapter.label}</span>
                    </span>
                  </p>
                  <h3 className="display mt-6 text-[clamp(2.2rem,3.7vw,3.5rem)] leading-[1]">
                    {chapter.title}
                  </h3>
                  <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-muted">{chapter.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
