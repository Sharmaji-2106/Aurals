"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One clock, and every control is an operation on it.
 *
 * Pause stops advancing it, replay sets it to zero, skip sets it to a mark,
 * stage navigation sets it to that stage's start, and speed scales the delta.
 * None of those needs to know anything about what is being animated, which is
 * why none of them can leave a scene in a state that does not correspond to an
 * instant — and why scrubbing, replay and speed came free rather than as three
 * separate features that each had to be debugged.
 *
 * Time spent in a hidden tab is excluded rather than accumulated, so returning
 * to the tab resumes where you left instead of finding the sequence over.
 */

export type Playback<Stage extends string> = {
  time: number;
  playing: boolean;
  speed: number;
  stage: Stage;
  progress: number;
  finished: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  replay(): void;
  reset(): void;
  skipTo(seconds: number): void;
  seek(seconds: number): void;
  goToStage(stage: Stage): void;
  setSpeed(speed: number): void;
};

export type PlaybackConfig<Stage extends string> = {
  /** Total length in seconds. The clock never exceeds it. */
  length: number;
  /** Where "skip" lands: a complete, settled, readable state. */
  skipTo: number;
  /** When each stage begins. The stage is derived from the clock, never stored. */
  stages: Readonly<Record<Stage, number>>;
  /** Stage names in order. */
  order: readonly Stage[];
  autoPlay?: boolean;
};

export function usePlaybackClock<Stage extends string>(config: PlaybackConfig<Stage>): Playback<Stage> {
  const { length, stages, order, autoPlay = false } = config;

  const [{ time, playing }, setClock] = useState({ time: 0, playing: autoPlay });
  const [speed, setSpeed] = useState(1);
  const previousFrame = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;

    let frame: number | null = null;
    previousFrame.current = null;

    const tick = (now: number) => {
      frame = null;
      if (document.visibilityState === "hidden") {
        previousFrame.current = null;
        return;
      }

      const delta = previousFrame.current === null ? 0 : (now - previousFrame.current) / 1000;
      previousFrame.current = now;
      setClock((clock) => {
        if (!clock.playing) return clock;
        const next = Math.min(length, clock.time + delta * speed);
        return { time: next, playing: next < length };
      });
      frame = requestAnimationFrame(tick);
    };

    const onVisibilityChange = () => {
      // A fresh timestamp on return excludes the time spent hidden.
      previousFrame.current = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = document.visibilityState === "hidden" ? null : requestAnimationFrame(tick);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState !== "hidden") frame = requestAnimationFrame(tick);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      previousFrame.current = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [playing, speed, length]);

  const play = useCallback(() => {
    previousFrame.current = null;
    setClock((clock) => ({ time: clock.time >= length ? 0 : clock.time, playing: true }));
  }, [length]);

  const pause = useCallback(() => {
    previousFrame.current = null;
    setClock((clock) => ({ ...clock, playing: false }));
  }, []);

  const toggle = useCallback(() => {
    previousFrame.current = null;
    setClock((clock) => ({
      time: !clock.playing && clock.time >= length ? 0 : clock.time,
      playing: !clock.playing,
    }));
  }, [length]);

  const replay = useCallback(() => {
    previousFrame.current = null;
    setClock({ time: 0, playing: true });
  }, []);

  const reset = useCallback(() => {
    previousFrame.current = null;
    setClock({ time: 0, playing: false });
  }, []);

  const seek = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      previousFrame.current = null;
      const next = Math.max(0, Math.min(length, seconds));
      setClock((clock) => ({ time: next, playing: clock.playing && next < length }));
    },
    [length],
  );

  const skipTo = useCallback(
    (seconds: number) => {
      previousFrame.current = null;
      setClock({ time: Math.max(0, Math.min(length, seconds)), playing: false });
    },
    [length],
  );

  const goToStage = useCallback(
    (stage: Stage) => {
      previousFrame.current = null;
      setClock((clock) => ({ time: stages[stage], playing: clock.playing }));
    },
    [stages],
  );

  let stage = order[0];
  for (const candidate of order) {
    if (time >= stages[candidate]) stage = candidate;
    else break;
  }

  return {
    time,
    playing,
    speed,
    stage,
    progress: Math.min(1, Math.max(0, time / length)),
    finished: time >= length,
    play,
    pause,
    toggle,
    replay,
    reset,
    skipTo,
    seek,
    goToStage,
    setSpeed,
  };
}
