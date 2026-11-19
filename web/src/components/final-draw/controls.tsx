"use client";

import {
  SEQUENCE_SECONDS,
  SPEEDS,
  STAGES,
  STAGE_LABEL,
  STAGE_START,
  type Stage,
} from "@/components/final-draw/contract";
import type { Playback } from "@/components/final-draw/use-playback";
import { cn } from "@/lib/cn";
import { Pause, Play, RotateCcw, SkipForward, Square } from "lucide-react";

/**
 * The studio's controls.
 *
 * Every one of these is a write to a single number, which is why they compose
 * without interfering: you can scrub into the middle of the riffle at 0.75x,
 * jump to the flip, step back a stage and press play, and the scene simply
 * shows the instant it was asked for. Nothing here has to be reset or torn
 * down between uses.
 */

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
      title={label}
      aria-label={label}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] whitespace-nowrap transition-colors",
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

export function Controls({
  playback,
  onTransition,
  showDebug,
  onToggleDebug,
  className,
}: {
  playback: Playback;
  /** Hand the card over to the results page. */
  onTransition?: () => void;
  showDebug: boolean;
  onToggleDebug: () => void;
  className?: string;
}) {
  const { time, playing, speed, stage, progress } = playback;

  return (
    <div
      className={cn(
        "flex w-full max-w-[920px] flex-col gap-3 rounded-2xl border border-hairline bg-elevated/95 p-3",
        className,
      )}
    >
      {/* Scrub. The scene is a function of time, so dragging this is not a
          preview of the sequence — it is the sequence. */}
      <div className="flex items-center gap-3">
        <span className="numeric w-[74px] shrink-0 text-[11px] text-ink-faint">
          {time.toFixed(2)}s / {SEQUENCE_SECONDS}s
        </span>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={SEQUENCE_SECONDS}
            step={0.01}
            value={time}
            onChange={(event) => playback.seek(Number(event.target.value))}
            aria-label="Scrub the sequence"
            className="relative z-10 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 outline-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ember"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 my-auto h-1.5 rounded-full bg-ember/45"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="w-[112px] shrink-0 text-right font-mono text-[10px] tracking-[0.16em] text-ember uppercase">
          {STAGE_LABEL[stage]}
        </span>
      </div>

      {/* Transport. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={playback.toggle}
          label={playing ? "Pause" : time > 0 ? "Resume" : "Play"}
          icon={playing ? <Pause className="size-3" /> : <Play className="size-3" />}
          active={playing}
        />
        <Button onClick={playback.replay} label="Replay" icon={<RotateCcw className="size-3" />} />
        <Button onClick={playback.reset} label="Reset" icon={<Square className="size-3" />} />
        <Button
          onClick={playback.skipToReveal}
          label="Skip to reveal"
          icon={<SkipForward className="size-3" />}
        />
        {onTransition && (
          <Button onClick={onTransition} label="Skip to results" icon={<SkipForward className="size-3" />} />
        )}

        <span className="mx-1 h-5 w-px bg-white/10" />

        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => playback.setSpeed(value)}
            className={cn(
              "numeric h-8 rounded-full border px-2.5 text-[11px] transition-colors",
              speed === value
                ? "border-ember/55 bg-ember/10 text-ink"
                : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
            )}
          >
            {value}&times;
          </button>
        ))}

        <span className="mx-1 h-5 w-px bg-white/10" />

        <button
          type="button"
          onClick={onToggleDebug}
          aria-pressed={showDebug}
          className={cn(
            "h-8 rounded-full border px-3 font-mono text-[10px] tracking-[0.16em] uppercase transition-colors",
            showDebug
              ? "border-ember/55 bg-ember/10 text-ink"
              : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
          )}
        >
          Debug
        </button>
      </div>

      {/* Stage navigation. */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline pt-3">
        {STAGES.map((value, i) => (
          <StageChip
            key={value}
            n={i + 1}
            stage={value}
            current={stage === value}
            onClick={() => playback.goToStage(value)}
          />
        ))}
        {onTransition && (
          <button
            type="button"
            onClick={onTransition}
            className="flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong px-2.5 font-mono text-[10px] text-ink-faint transition-colors hover:border-white/25 hover:text-ink"
          >
            <span className="numeric text-ink-faint/70">09</span>
            Results transition
          </button>
        )}
      </div>
    </div>
  );
}

function StageChip({
  n,
  stage,
  current,
  onClick,
}: {
  n: number;
  stage: Stage;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${STAGE_LABEL[stage]} — ${STAGE_START[stage].toFixed(2)}s`}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] whitespace-nowrap transition-colors",
        current
          ? "border-ember/55 bg-ember/10 text-ink"
          : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
      )}
    >
      <span className={cn("numeric", current ? "text-ember" : "text-ink-faint/70")}>
        {String(n).padStart(2, "0")}
      </span>
      {STAGE_LABEL[stage]}
    </button>
  );
}
