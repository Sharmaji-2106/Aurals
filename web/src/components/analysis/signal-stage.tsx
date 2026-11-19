"use client";

import { BandRail } from "@/components/signature/band-rail";
import {
  SignatureStage,
  StageBand,
  StageBands,
  StageLine,
  StageReference,
  StageTraces,
} from "@/components/signature/stage";
import type { Submission } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { columnQuantiles } from "@/lib/stats";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

const DOMAIN: [number, number] = [-32, 14];

/**
 * The user's songs as they are measured: every finished track adds its own trace, and the
 * listening signature (median, with the middle half shaded) sharpens as they accumulate.
 */
export function SignalStage({ submission: s, focus }: { submission: Submission; focus: string | null }) {
  const reduced = useReducedMotion();
  const freqs = s.spectrum_freqs_hz ?? [];
  const traces = useMemo(
    () => s.tracks.filter((t) => t.spectrum).map((t) => ({ id: t.id, values: t.spectrum! })),
    [s.tracks],
  );
  const [p25, median, p75] = useMemo(
    () =>
      columnQuantiles(
        traces.map((t) => t.values),
        [0.25, 0.5, 0.75],
      ),
    [traces],
  );
  const active = ["queued", "resolving", "analyzing", "aggregating"].includes(s.status);
  const done = s.status === "completed";
  const n = traces.length;
  // The signature earns its brightness: faint with a few songs, solid once there are enough.
  const certainty = done ? 1 : Math.min(1, 0.25 + n / 16);
  const focused = s.tracks.find((t) => t.id === focus);

  return (
    <div className="relative">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-ink-faint">
          <span className="flex items-center gap-2">
            <span className="h-px w-5 bg-linear-to-r from-ember/60 to-band-air/60" />
            {n ? plural(n, "song") : "Songs appear as they're measured"}
          </span>
          {n > 1 && (
            <span className="flex items-center gap-2">
              <span className="h-[3px] w-5 rounded-full bg-linear-to-r from-ember to-band-air" />
              {done ? "Your listening signature" : "Signature forming"}
            </span>
          )}
        </div>
        <AnimatePresence mode="wait">
          {focused ? (
            <motion.span
              key={focused.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-[60%] truncate text-ink"
            >
              {focused.title}
            </motion.span>
          ) : (
            <motion.span
              key="measured"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="numeric text-[10px] tracking-wider text-ink-faint uppercase"
            >
              Measured · power per octave vs midrange
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="relative overflow-x-clip">
        <SignatureStage
          height={400}
          domain={DOMAIN}
          label={`Spectra of ${n} analysed songs and their median`}
          className={cn(n === 0 && "opacity-60")}
        >
          <StageBands />
          <StageReference value={0} label="midrange" />
          {n > 0 && (
            <StageTraces
              freqs={freqs}
              traces={traces}
              highlight={focus}
              opacity={done ? 0.16 : Math.max(0.16, 0.5 - n * 0.012)}
            />
          )}
          {n > 1 && <StageBand freqs={freqs} lower={p25} upper={p75} opacity={0.1 + 0.08 * certainty} />}
          {n > 1 && (
            <StageLine series={{ freqs, values: median }} opacity={certainty} width={done ? 3 : 2.5} />
          )}
        </SignatureStage>

        {/* While songs are still arriving the plate breathes, very slightly.
            Nothing sweeps across it: the only things that move on this stage
            are traces that were actually measured. */}
        {active && !reduced && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(60% 70% at 50% 60%, rgb(255 148 102 / 0.07), transparent 70%)",
            }}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <AnimatePresence>
          {n === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center"
            >
              <p className="max-w-xs text-center text-[14px] leading-relaxed text-ink-muted">
                {s.status === "failed"
                  ? "Nothing could be measured."
                  : s.counts.total
                    ? "Downloading and measuring your first songs…"
                    : "Looking up your music…"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BandRail className="mt-2" />
      {focus === null && n > 0 && (
        <p className="sr-only" aria-live="polite">
          {plural(n, "song")} measured
        </p>
      )}
    </div>
  );
}
