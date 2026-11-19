"use client";

import { BandRail } from "@/components/signature/band-rail";
import { SignatureStage, StageArea, StageBands, StageFocus, StageLine } from "@/components/signature/stage";
import { Lines, Reveal } from "@/components/site/reveal";
import { BAND_STORIES } from "@/lib/band-stories";
import { BANDS, bandCenter, type BandKey } from "@/lib/bands";
import { playBand } from "@/lib/band-tone";
import { formatHz } from "@/lib/format";
import { Headphones, Square } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ILLUSTRATION_FREQS as F, MUSIC } from "./illustration";

const logPos = (hz: number) => Math.log(hz / 20) / Math.log(1000);

/** The illustrative spectrum with the active band gently lifted: "more of this". */
function lifted(key: BandKey) {
  const band = BANDS.find((b) => b.key === key)!;
  const c = logPos(bandCenter(band));
  const w = Math.max(0.035, (logPos(band.high) - logPos(band.low)) / 2);
  return F.map((f, i) => MUSIC[i] + 0.22 * Math.exp(-(((logPos(f) - c) / w) ** 2)));
}

export function BandExplorer() {
  const [active, setActive] = useState<BandKey>("sub_bass");
  const [touched, setTouched] = useState(false);
  const [playing, setPlaying] = useState<BandKey | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduced = useReducedMotion();
  const stopRef = useRef<(() => void) | null>(null);

  // Walk through the vocabulary until the visitor takes over.
  useEffect(() => {
    if (touched || !inView || reduced) return;
    const timer = window.setInterval(() => {
      setActive((key) => BANDS[(BANDS.findIndex((b) => b.key === key) + 1) % BANDS.length].key);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [touched, inView, reduced]);

  useEffect(() => () => stopRef.current?.(), []);

  const select = (key: BandKey | null) => {
    if (!key) return;
    setTouched(true);
    setActive(key);
  };

  const index = BANDS.findIndex((b) => b.key === active);
  const band = BANDS[index];
  const story = BAND_STORIES[active];

  const toggleSound = () => {
    setTouched(true);
    if (playing) {
      stopRef.current?.();
      setPlaying(null);
      return;
    }
    setPlaying(active);
    stopRef.current = playBand(band.low, band.high, () => setPlaying(null));
  };

  return (
    <section id="bands" className="relative scroll-mt-10">
      <div className="shell pt-28 pb-8 sm:pt-44 sm:pb-12">
        <div className="grid grid-cols-1 items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow eyebrow-rule text-ink-muted">A shared vocabulary · Blue hour</p>
            <h2 className="marquee mt-6 text-[clamp(3.2rem,7.6vw,7.75rem)]">
              <Lines onView>
                <>Nine bands.</>
                <>
                  One language for <em className="voice text-dusk">sound</em>.
                </>
              </Lines>
            </h2>
          </div>
          <Reveal delay={0.2}>
            <p className="lede max-w-sm lg:pb-3">
              Your music and every earphone are described in the same nine regions of the spectrum. Explore
              them: point at the line, or pick a band and listen.
            </p>
          </Reveal>
        </div>

        {/* One instrument, not two columns: the spectrum and what it means share
            a plate, and the plate takes its light from the band in play. */}
        <div
          ref={ref}
          className="glass relative mt-14 overflow-hidden rounded-[1.75rem] sm:mt-20"
          style={{ ["--band" as string]: band.color }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-[background] duration-1000"
            style={{
              background: `radial-gradient(58% 80% at ${12 + (index / (BANDS.length - 1)) * 44}% 110%, color-mix(in oklab, ${band.color} 16%, transparent), transparent 70%)`,
            }}
          />
          <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="min-w-0 px-5 pt-6 pb-5 sm:px-9 sm:pt-9 sm:pb-8">
              <div className="flex items-baseline justify-between gap-4">
                <p className="eyebrow">Spectrum</p>
                <p className="numeric text-[10px] tracking-[0.14em] text-ink-faint uppercase">
                  20 Hz <span className="mx-1 text-ink-faint/50">→</span> 20 kHz
                </p>
              </div>
              <SignatureStage
                height={320}
                domain={[-0.75, 1]}
                label={`Spectrum with the ${band.label} band highlighted`}
                onPointerBand={(key) => key && select(key)}
                className="mt-4 cursor-crosshair"
              >
                <StageBands active={active} />
                <StageArea series={{ freqs: F, values: lifted(active) }} opacity={0.9} />
                <StageLine series={{ freqs: F, values: lifted(active) }} />
                <StageFocus active={active} strength={0.62} fill="#050506" />
              </SignatureStage>
              <BandRail active={active} onSelect={select} className="mt-3" />
            </div>

            <div
              aria-live="polite"
              className="relative flex min-h-[25rem] flex-col border-t border-hairline px-5 pt-7 pb-7 sm:px-9 sm:pt-9 sm:pb-9 lg:border-t-0 lg:border-l"
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="numeric flex items-center gap-2.5 text-[11px] tracking-[0.12em] text-ink-muted">
                  <span
                    className="size-1.5 rounded-full transition-colors duration-700"
                    style={{ background: band.color }}
                  />
                  {formatHz(band.low)}–{formatHz(band.high)} Hz
                </p>
                <p className="numeric text-[11px] tracking-[0.14em] text-ink-faint">
                  <span className="text-ink">0{index + 1}</span> / 0{BANDS.length}
                </p>
              </div>

              <div className="mt-8 flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <h3 className="display text-[clamp(3rem,5vw,4.75rem)] leading-[0.92]">{band.label}</h3>
                    <p className="mt-3 font-display text-[1.375rem] leading-snug text-ink-muted italic">
                      {story.hear.charAt(0).toUpperCase() + story.hear.slice(1)}.
                    </p>
                    <dl className="mt-8 grid grid-cols-[4.75rem_1fr] gap-x-4 gap-y-3.5 text-[14px] leading-snug">
                      <dt className="eyebrow pt-0.5">More</dt>
                      <dd className="text-ink-muted">{story.more}</dd>
                      <dt className="eyebrow pt-0.5">Less</dt>
                      <dd className="text-ink-muted">{story.less}</dd>
                      <dt className="eyebrow pt-0.5">Heard in</dt>
                      <dd className="text-ink-muted">{story.where}</dd>
                    </dl>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-8">
                <button
                  type="button"
                  onClick={toggleSound}
                  className="group inline-flex items-center gap-3 rounded-full bg-white/[0.04] py-1.5 pr-5 pl-1.5 text-[13px] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] transition-[background-color,box-shadow] duration-500 hover:bg-white/[0.07] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.22)]"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-linear-to-b from-bone to-ink text-canvas shadow-[inset_0_1px_0_rgb(255_255_255/0.9)]">
                    {playing ? <Square className="size-3 fill-current" /> : <Headphones className="size-4" />}
                  </span>
                  {playing ? "Stop" : `Hear ${band.label.toLowerCase()} alone`}
                  {playing && (
                    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-[2px] origin-bottom rounded-full bg-ember"
                          style={{
                            height: "100%",
                            animation: `eq-bar 0.7s ${i * 0.12}s ease-in-out infinite alternate`,
                          }}
                        />
                      ))}
                    </span>
                  )}
                </button>
                <p className="mt-3 text-[12px] text-ink-faint">
                  Filtered noise, quietly. Headphones help for the lowest bands.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
