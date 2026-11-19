"use client";

import { ProductArt } from "@/components/results/product-art";
import { buildEntries } from "@/components/selection/entries";
import {
  SEQUENCE_SECONDS,
  SKIP_TO,
  SPEEDS,
  STAGES,
  STAGE_LABEL,
  STAGE_START,
  type Stage,
} from "@/components/selection/contract";
import {
  MEASURED_COUNT,
  RAIL_RECOMMENDATIONS,
  RECOMMENDER,
  REFERENCE_TARGET,
} from "@/components/selection/demo-data";
import { SelectionRail } from "@/components/selection/rail";
import { cn } from "@/lib/cn";
import { usePlaybackClock } from "@/lib/playback";
import { Pause, Play, RotateCcw, SkipForward, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * The Selection Rail studio.
 *
 * An isolated route, so the sequence can be watched, scrubbed and measured
 * without going through onboarding, a questionnaire and a music analysis first.
 * It is a development surface: the collection is a captured snapshot of a real
 * engine run, and it says so.
 *
 * The controls are deliberately quiet and tucked into a corner — the brief's
 * instruction, and the right one. A development panel that dominates the
 * viewport makes it impossible to judge the thing it exists to inspect.
 */
export default function SelectionStudioPage() {
  const playback = usePlaybackClock<Stage>({
    length: SEQUENCE_SECONDS,
    skipTo: SKIP_TO,
    stages: STAGE_START,
    order: STAGES,
    autoPlay: true,
  });

  // Hidden by default, as the brief asks. A development panel that occupies a
  // fifth of the viewport makes it impossible to judge the thing it exists to
  // inspect.
  const [showControls, setShowControls] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // A handle for the capture harness. The scene is a pure function of its
  // clock, so parking it at an instant renders exactly what plays there.
  const { pause, seek } = playback;
  useEffect(() => {
    const host = window as unknown as { __railSeek?: (seconds: number) => void };
    host.__railSeek = (seconds: number) => {
      pause();
      seek(seconds);
    };
    return () => {
      delete host.__railSeek;
    };
  }, [pause, seek]);

  const entries = useMemo(
    () =>
      buildEntries(RAIL_RECOMMENDATIONS, (rec, isWinner) => (
        <ProductArt rec={rec} className="p-[6%]" intensity={isWinner ? 0.9 : 0.78} animate={isWinner} />
      )),
    [],
  );

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-[#08090C]"
      data-stage={playback.stage}
      data-time={playback.time.toFixed(3)}
    >
      <SelectionRail time={playback.time} entries={entries} still={reduced} className="absolute inset-0" />

      {/* Identity, and an unambiguous statement of what this page is. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-6 p-6 sm:p-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ink-faint uppercase">AURALS</p>
          <h1 className="display mt-1.5 text-[20px] leading-none tracking-[-0.02em] text-ink">
            The Selection Rail
          </h1>
          <p className="numeric mt-2 text-[10.5px] text-ink-faint">
            {MEASURED_COUNT} measured earphones &middot; one recommendation
          </p>
        </div>
        <div className="text-right">
          <p className="rounded-full border border-ember/35 bg-ember/10 px-2.5 py-1 font-mono text-[9.5px] tracking-[0.22em] text-ember uppercase">
            Development demo
          </p>
          {reduced && (
            <p className="mt-2 font-mono text-[9px] tracking-[0.18em] text-ink-faint uppercase">
              Reduced motion &middot; still
            </p>
          )}
        </div>
      </div>

      {/* Provenance, small, where it belongs: the numbers on screen came from
          somewhere and the page should say where. */}
      <p className="pointer-events-none absolute bottom-5 left-6 z-30 max-w-[420px] font-mono text-[8.5px] leading-[1.7] tracking-[0.1em] text-ink-faint/60 uppercase sm:left-8">
        Captured from a real run of {RECOMMENDER} against {REFERENCE_TARGET}. No price, stock or review data
        is shown, because none is held.
      </p>

      {!reduced && (
        <Controls playback={playback} open={showControls} onToggle={() => setShowControls((on) => !on)} />
      )}
    </main>
  );
}

/* --------------------------------------------------------------- controls --- */

function Button({
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
      aria-label={label}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] whitespace-nowrap transition-colors",
        active
          ? "border-ember/55 bg-ember/10 text-ink"
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
  open,
  onToggle,
}: {
  playback: ReturnType<typeof usePlaybackClock<Stage>>;
  open: boolean;
  onToggle: () => void;
}) {
  const { time, playing, speed, stage, progress } = playback;

  return (
    <div className="absolute right-4 bottom-4 z-30 flex flex-col items-end gap-2 sm:right-6 sm:bottom-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="rounded-full border border-hairline-strong bg-elevated/80 px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-ink-faint uppercase backdrop-blur-md transition-colors hover:text-ink"
      >
        {open ? "Hide controls" : "Controls"}
      </button>

      {open && (
        <div className="flex w-[min(92vw,560px)] flex-col gap-2.5 rounded-2xl border border-hairline bg-elevated/85 p-3 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="numeric w-[70px] shrink-0 text-[10px] text-ink-faint">{time.toFixed(2)}s</span>
            <div className="relative flex-1">
              <input
                type="range"
                min={0}
                max={SEQUENCE_SECONDS}
                step={0.01}
                value={time}
                onChange={(event) => playback.seek(Number(event.target.value))}
                aria-label="Scrub the sequence"
                className="relative z-10 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 outline-none [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ember"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 my-auto h-1.5 rounded-full bg-ember/45"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="w-[96px] shrink-0 text-right font-mono text-[9px] tracking-[0.14em] text-ember uppercase">
              {STAGE_LABEL[stage]}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              onClick={playback.toggle}
              label={playing ? "Pause" : time > 0 ? "Resume" : "Play"}
              icon={playing ? <Pause className="size-3" /> : <Play className="size-3" />}
              active={playing}
            />
            <Button onClick={playback.replay} label="Replay" icon={<RotateCcw className="size-3" />} />
            <Button onClick={playback.reset} label="Reset" icon={<Square className="size-3" />} />
            <Button
              onClick={() => playback.skipTo(STAGE_START.selection)}
              label="Skip to selection"
              icon={<SkipForward className="size-3" />}
            />
            <Button
              onClick={() => playback.skipTo(SKIP_TO)}
              label="Skip to reveal"
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
                    ? "border-ember/55 bg-ember/10 text-ink"
                    : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
                )}
              >
                {value}&times;
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
            {STAGES.map((value, i) => (
              <button
                key={value}
                type="button"
                onClick={() => playback.goToStage(value)}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[9.5px] whitespace-nowrap transition-colors",
                  stage === value
                    ? "border-ember/55 bg-ember/10 text-ink"
                    : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
                )}
              >
                <span className={cn("numeric", stage === value ? "text-ember" : "text-ink-faint/70")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {STAGE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
