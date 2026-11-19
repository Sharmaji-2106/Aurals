"use client";

import { BandRail } from "@/components/signature/band-rail";
import {
  SAID_COLOR,
  SignatureStage,
  StageBand,
  StageBands,
  StageDots,
  StageFocus,
  StageLine,
  StageReference,
  StageScale,
} from "@/components/signature/stage";
import type { Dimension, SoundPreview } from "@/lib/api/client";
import { BANDS } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { relation } from "@/lib/evidence";
import { AnimatePresence, motion } from "motion/react";

/** Which part of the spectrum (or which character trait) each question is about. */
export const QUESTION_FOCUS: Record<string, { range?: [number, number]; trait?: Dimension["key"] }> = {
  bass_amount: { range: [20, 200] },
  bass_character: { range: [20, 200] },
  vocals: { range: [1200, 5000] },
  treble_feel: { range: [3000, 20000], trait: "treble_tolerance" },
  tone: {},
  energy: { trait: "energy" },
  detail: { trait: "detail" },
  soundstage: { trait: "soundstage" },
  naturalness: { trait: "naturalness" },
};

const TRAITS: { key: Dimension["key"]; label: string }[] = [
  { key: "energy", label: "Energy" },
  { key: "treble_tolerance", label: "Treble tolerance" },
  { key: "detail", label: "Detail" },
  { key: "soundstage", label: "Space" },
  { key: "naturalness", label: "Naturalness" },
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

function lean(db: number) {
  if (Math.abs(db) < 0.4) return "close to neutral";
  const more = db > 0;
  return Math.abs(db) < 1.5
    ? `a touch ${more ? "more" : "less"} than neutral`
    : `${more ? "more" : "less"} than neutral`;
}

function presentation(value: number | null) {
  if (value === null) return "balanced";
  return value > 0.56 ? "lively" : value < 0.44 ? "relaxed" : "balanced";
}

/** One sentence on what the current question does to the music's line. */
function focusNote(preview: SoundPreview, questionId: string, hasMusic: boolean, answered: boolean) {
  const focus = QUESTION_FOCUS[questionId];
  const profile = preview.preview;
  const trait = focus?.trait ? profile.dimensions.find((d) => d.key === focus.trait) : undefined;
  if (trait && !trait.measurable_from_music) return "Music can’t show this. Only you can.";
  if (!hasMusic) return "No music yet, so your answer shapes this directly.";
  if (trait && !focus?.range) {
    if (!answered) return `Your music suggests a ${presentation(trait.music_value)} presentation.`;
    return relation(trait.basis) ?? "Your answer refines what your music shows.";
  }
  const [low, high] = focus?.range ?? [20, 20000];
  const points = profile.preference_curve.filter(
    (c) => !c.reference && c.center_hz >= low && c.center_hz <= high,
  );
  if (!answered) {
    const music = profile.layers.music ?? [];
    const db = mean(points.map((c) => music.find((m) => m.band === c.band)?.offset_db ?? 0));
    return `Your music suggests ${lean(db)} here. Your answer refines it.`;
  }
  const order = ["differ", "refine", "agree"] as const;
  const agreement = order.find((a) => points.some((c) => c.basis.agreement === a));
  const basis = points.find((c) => c.basis.agreement === agreement)?.basis ?? points[0]?.basis;
  return (basis && relation(basis)) ?? "Your answer refines what your music shows.";
}

/**
 * The listener's sound as it is refined: the line their music draws (solid), what
 * their answers say (dashed), and the sound the two combine into. The shaded range
 * spans the evidence and narrows as it agrees.
 */
export function SoundShaper({
  preview,
  questionId,
  music,
  answered,
  answeredThis,
}: {
  preview: SoundPreview | undefined;
  questionId: string | null;
  music: "ready" | "measuring" | "none";
  answered: number;
  answeredThis: boolean;
}) {
  const hasMusic = music === "ready";
  const focus = questionId ? QUESTION_FOCUS[questionId] : undefined;
  const profile = preview?.preview;
  const curve = profile?.preference_curve ?? [];
  const fromMusic = profile?.layers.music ?? null;
  const fromAnswers = profile?.layers.answers ?? null;
  const freqs = curve.map((c) => c.center_hz);
  const dims = new Map(profile?.dimensions.map((d) => [d.key, d]) ?? []);
  const note = preview && questionId ? focusNote(preview, questionId, hasMusic, answeredThis) : null;

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow shrink-0 whitespace-nowrap text-ink-muted">Your sound</p>
        <p className="text-right text-[11px] text-ink-faint">
          {music === "ready"
            ? "Drawn from your music"
            : music === "measuring"
              ? "Music still measuring"
              : "No music yet"}
          {answered ? ` · refined by ${answered} answer${answered === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      <div className="relative mt-2 h-[132px] lg:mt-4 lg:h-[260px]">
        <SignatureStage height="100%" domain={[-8, 8]} label="Your sound curve as your answers refine it">
          <StageBands />
          <StageScale values={[4, -4]} />
          <StageReference value={0} label="neutral" />
          {curve.length > 0 && (
            <>
              <StageBand
                freqs={freqs}
                lower={curve.map((c) => c.low_db)}
                upper={curve.map((c) => c.high_db)}
                opacity={0.13}
                tension={0.7}
              />
              {fromMusic && (
                <StageLine
                  series={{ freqs, values: fromMusic.map((c) => c.offset_db) }}
                  variant="white"
                  glow={false}
                  tension={0.7}
                  width={1.5}
                  opacity={0.6}
                />
              )}
              {fromAnswers && (
                <StageLine
                  series={{ freqs, values: fromAnswers.map((c) => c.offset_db) }}
                  variant="said"
                  glow={false}
                  tension={0.7}
                  width={1.5}
                  opacity={0.7}
                />
              )}
              <StageLine series={{ freqs, values: curve.map((c) => c.offset_db) }} tension={0.7} />
              <StageDots
                series={{ freqs, values: curve.map((c) => c.offset_db) }}
                colors={BANDS.map((b) => b.color)}
              />
            </>
          )}
          <StageFocus range={focus?.range ?? null} strength={0.72} />
        </SignatureStage>
      </div>
      <BandRail className="mt-1 lg:mt-2" />

      <div className="mt-5 hidden flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-ink-faint lg:flex">
        {fromMusic && (
          <span className="flex items-center gap-2">
            <span className="h-[2px] w-5 bg-ink/60" /> your music
          </span>
        )}
        {fromAnswers && (
          <span className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-dashed" style={{ borderColor: SAID_COLOR }} /> you said
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-5 rounded-full bg-linear-to-r from-ember to-band-air" /> your sound
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {note && (
          <motion.p
            key={note}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-3 text-[13px] leading-relaxed text-ink-muted lg:mt-6 lg:font-display lg:text-[1.375rem] lg:leading-snug lg:text-ink"
          >
            {note}
          </motion.p>
        )}
      </AnimatePresence>

      <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2 lg:mt-7 lg:border-t lg:border-hairline lg:pt-6">
        {TRAITS.map((t) => {
          const d = dims.get(t.key);
          const lit = focus?.trait === t.key;
          return (
            <li
              key={t.key}
              className={cn(
                "transition-opacity duration-500",
                focus?.trait && !lit && "opacity-40",
                !lit && "hidden lg:block",
              )}
            >
              <div className="flex items-baseline justify-between text-[12px]">
                <span className={lit ? "text-ink" : "text-ink-muted"}>{t.label}</span>
                <span className="text-[11px] text-ink-faint">
                  {d && d.confidence < 0.2
                    ? "unknown"
                    : d
                      ? d.value > 0.6
                        ? d.high_label
                        : d.value < 0.4
                          ? d.low_label
                          : "balanced"
                      : ""}
                </span>
              </div>
              <div className="relative mt-2 h-[3px] rounded-full bg-white/[0.07]">
                <motion.div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    lit ? "bg-linear-to-r from-ember to-band-mids" : "bg-white/30",
                  )}
                  initial={false}
                  animate={{
                    width: `${(d?.value ?? 0.5) * 100}%`,
                    opacity: 0.35 + 0.65 * (d?.confidence ?? 0),
                  }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
