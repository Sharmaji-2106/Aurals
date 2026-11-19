"use client";

import { EvidenceDots, EvidenceTag } from "@/components/profile/evidence-tag";
import { BandRail } from "@/components/signature/band-rail";
import {
  SAID_COLOR,
  SignatureStage,
  StageBand,
  StageDots,
  StageFocus,
  StageLine,
  StageReference,
  StageScale,
  StageTraces,
} from "@/components/signature/stage";
import type { CurvePoint, MusicProfile, SoundProfile } from "@/lib/api/client";
import { useLatestAnswers } from "@/lib/api/hooks";
import { BAND_STORIES } from "@/lib/band-stories";
import { BANDS, type BandKey } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { evidenceLevel, relation } from "@/lib/evidence";
import { formatSigned, plural } from "@/lib/format";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

type View = "music" | "answers" | "combined";

const VIEWS: { key: View; label: string }[] = [
  { key: "music", label: "Music" },
  { key: "answers", label: "Answers" },
  { key: "combined", label: "Combined" },
];

const values = (curve: readonly CurvePoint[]) => curve.map((c) => c.offset_db);

/**
 * The profile's central image. The listener's songs sit behind as faint evidence; in
 * front, one line shows what the music suggests, what the answers say, or the sound
 * the two combine into, morphing between them so the refinement can be seen.
 */
export function SoundPortrait({ sound, music }: { sound: SoundProfile; music: MusicProfile | null }) {
  const data = sound.data;
  const curve = data.preference_curve;
  const fromMusic = data.layers.music ?? null;
  const fromAnswers = data.layers.answers ?? null;
  const both = !!fromMusic && !!fromAnswers;
  const reduce = useReducedMotion();
  const [view, setView] = useState<View>(both ? "music" : "combined");
  const [band, setBand] = useState<BandKey | null>(null);
  const touched = useRef(false);
  const freqs = curve.map((c) => c.center_hz);
  const latest = useLatestAnswers();
  const answered = Object.values(latest.data?.answers ?? {}).filter((v) => v !== null).length;

  // The reveal: first what the music says, then the sound it became.
  useEffect(() => {
    if (!both) return;
    const timer = window.setTimeout(() => !touched.current && setView("combined"), reduce ? 0 : 3200);
    return () => window.clearTimeout(timer);
  }, [both, reduce]);

  const traces = useMemo(
    () => (music ? Object.entries(music.track_spectra).map(([id, v]) => ({ id, values: v })) : []),
    [music],
  );

  const shown =
    view === "music" && fromMusic ? fromMusic : view === "answers" && fromAnswers ? fromAnswers : curve;
  const limit = useMemo(() => {
    const all = [curve, fromMusic, fromAnswers].flatMap((layer) =>
      layer ? layer.flatMap((c) => [c.low_db, c.high_db, c.offset_db].map(Math.abs)) : [],
    );
    return Math.ceil(Math.max(3, ...all) + 1);
  }, [curve, fromMusic, fromAnswers]);
  const mark = limit >= 7 ? 5 : limit >= 5 ? 3 : 2;

  const caption =
    view === "music"
      ? `What your ${music ? plural(music.track_count, "song") : "music"} suggest${music?.track_count === 1 ? "s" : ""}`
      : view === "answers"
        ? answered
          ? `What your ${plural(answered, "answer")} say${answered === 1 ? "s" : ""}`
          : "What your answers say"
        : both
          ? "Your sound: your music, refined by your answers"
          : fromMusic
            ? "Your sound, from your music alone"
            : "Your sound, from your answers alone";

  const choose = (next: View) => {
    touched.current = true;
    setView(next);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-[14px] text-ink-muted"
            aria-live="polite"
          >
            {caption}
          </motion.p>
        </AnimatePresence>
        {(fromMusic || fromAnswers) && (
          <div
            role="radiogroup"
            aria-label="Show the curve from"
            className="flex rounded-full border border-hairline-strong p-1"
          >
            {VIEWS.map((v) => {
              const available = v.key === "combined" || (v.key === "music" ? !!fromMusic : !!fromAnswers);
              const on = view === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!available}
                  onClick={() => choose(v.key)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[12px] transition-colors",
                    on ? "bg-white/[0.08] text-ink" : "text-ink-faint hover:text-ink-muted",
                    !available && "cursor-not-allowed opacity-35 hover:text-ink-faint",
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative mt-3 h-[300px] sm:h-[min(440px,46vh)] sm:min-h-[340px]">
        {traces.length > 0 && (
          <SignatureStage
            height="100%"
            domain={[-40, 22]}
            label="Your songs' measured spectra"
            className="absolute inset-0 transition-opacity duration-700"
          >
            <StageTraces
              freqs={music!.spectrum_freqs_hz}
              traces={traces}
              opacity={view === "music" ? 0.13 : view === "answers" ? 0.03 : 0.06}
            />
          </SignatureStage>
        )}
        <SignatureStage
          height="100%"
          domain={[-limit, limit]}
          label="Your sound as a curve across nine frequency bands"
          className="absolute inset-0"
          onPointerBand={setBand}
          overlay={(ctx) => (
            <AnimatePresence>
              {band && (
                <BandCard
                  key={band}
                  band={band}
                  x={ctx.x(BANDS.find((b) => b.key === band)!.low)}
                  x2={ctx.x(BANDS.find((b) => b.key === band)!.high)}
                  width={ctx.width}
                  final={curve.find((c) => c.band === band)!}
                  music={fromMusic?.find((c) => c.band === band) ?? null}
                  said={fromAnswers?.find((c) => c.band === band) ?? null}
                />
              )}
            </AnimatePresence>
          )}
        >
          <StageScale values={[mark, -mark]} />
          <StageReference value={0} label="neutral" />
          <StageBand
            freqs={freqs}
            lower={shown.map((c) => c.low_db)}
            upper={shown.map((c) => c.high_db)}
            opacity={0.13}
            tension={0.7}
          />
          {fromMusic && fromAnswers && view !== "music" && (
            <StageLine
              series={{ freqs, values: values(fromMusic) }}
              variant="white"
              glow={false}
              tension={0.7}
              width={2}
              opacity={view === "combined" ? 0.75 : 0.35}
            />
          )}
          {fromAnswers && view === "combined" && (
            <StageLine
              series={{ freqs, values: values(fromAnswers) }}
              variant="said"
              glow={false}
              tension={0.7}
              width={1.5}
              opacity={0.75}
            />
          )}
          <StageLine series={{ freqs, values: values(shown) }} tension={0.7} width={3} draw />
          <StageDots series={{ freqs, values: values(shown) }} colors={BANDS.map((b) => b.color)} r={4} />
          <StageFocus active={band} strength={0.5} />
        </SignatureStage>
      </div>

      <BandRail
        active={band}
        onHover={setBand}
        className="mt-2"
        render={(key) => {
          const point = shown.find((c) => c.band === key);
          if (!point) return null;
          return point.reference ? (
            <span className="mt-1 hidden text-[10px] text-ink-faint sm:block">reference</span>
          ) : (
            <EvidenceDots level={evidenceLevel(point.basis)} className="mt-1.5 hidden sm:inline-flex" />
          );
        }}
      />

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-faint">
        {traces.length > 0 && view === "music" && (
          <span className="flex items-center gap-2">
            <span className="h-px w-5 bg-linear-to-r from-ember/60 to-band-air/60" /> one thread per song, as
            measured
          </span>
        )}
        {fromMusic && fromAnswers && view !== "music" && (
          <span className="flex items-center gap-2">
            <span className="h-[2px] w-5 bg-ink/70" /> your music suggests
          </span>
        )}
        {fromAnswers && view === "combined" && (
          <span className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-dashed" style={{ borderColor: SAID_COLOR }} /> you said
          </span>
        )}
        <span className="flex items-center gap-2">
          <EvidenceDots level={3} /> strong evidence
        </span>
        <span className="flex items-center gap-2">
          <EvidenceDots level={1} /> emerging
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-5 rounded-sm bg-white/10" /> the range the evidence allows
        </span>
        <span className="ml-auto hidden md:block">dB relative to a neutral tuning · hover a band</span>
      </div>
    </div>
  );
}

function Row({ label, db, color, dashed }: { label: string; db: number; color: string; dashed?: boolean }) {
  return (
    <>
      <dt className="flex items-center gap-2 text-ink-muted">
        <span
          className={cn("w-3", dashed ? "border-t border-dashed" : "h-px")}
          style={dashed ? { borderColor: color } : { background: color }}
        />
        {label}
      </dt>
      <dd className="text-right text-ink">{formatSigned(db)} dB</dd>
    </>
  );
}

function BandCard({
  band,
  x,
  x2,
  width,
  final,
  music,
  said,
}: {
  band: BandKey;
  x: number;
  x2: number;
  width: number;
  final: CurvePoint;
  music: CurvePoint | null;
  said: CurvePoint | null;
}) {
  const meta = BANDS.find((b) => b.key === band)!;
  const cardW = 260;
  const center = (x + x2) / 2;
  const left = Math.min(width - cardW, Math.max(0, center - cardW / 2));
  const note = relation(final.basis);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-none absolute top-2 z-10 rounded-2xl border border-hairline-strong bg-canvas/92 p-4 shadow-2xl backdrop-blur"
      style={{ left, width: cardW }}
    >
      <span className="flex items-center gap-2 text-[14px] text-ink">
        <span className="size-2 rounded-full" style={{ background: meta.color }} />
        {meta.label}
      </span>
      <p className="mt-1 text-[12px] text-ink-faint">{BAND_STORIES[band].hear}</p>
      {final.reference ? (
        <p className="mt-3 text-[12px] text-ink-muted">
          The reference region: every curve is drawn relative to it.
        </p>
      ) : (
        <>
          <dl className="numeric mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-[12px]">
            {music && <Row label="Your music" db={music.offset_db} color="rgb(238 235 229 / 0.7)" />}
            {said && <Row label="You said" db={said.offset_db} color={SAID_COLOR} dashed />}
            <Row label="Your sound" db={final.offset_db} color={meta.color} />
          </dl>
          <EvidenceTag basis={final.basis} className="mt-3 text-[11px]" />
          {note && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{note}</p>}
        </>
      )}
    </motion.div>
  );
}
