"use client";

import {
  SEQUENCE_SECONDS,
  SKIP_TO,
  STAGE_START,
  progressAt,
  stageAt,
  type Speed,
  type Stage,
} from "@/components/final-draw/contract";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One clock, and every control is an operation on it.
 *
 * Pause stops advancing it, replay sets it to zero, skip sets it to a mark,
 * stage navigation sets it to that stage's start, and speed scales the delta.
 * None of those needs to know anything about cards, which is why none of them
 * can leave the scene in a state that does not correspond to an instant.
 *
 * Time spent in a hidden tab is excluded rather than accumulated, so coming
 * back to the tab resumes where you left instead of finding the sequence over.
 */

export type Playback = {
  time: number;
  playing: boolean;
  speed: Speed;
  stage: Stage;
  progress: number;
  finished: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  replay(): void;
  reset(): void;
  skipToReveal(): void;
  seek(seconds: number): void;
  goToStage(stage: Stage): void;
  setSpeed(speed: Speed): void;
};

export function usePlayback(options?: { autoPlay?: boolean }): Playback {
  const [{ time, playing }, setClock] = useState({
    time: 0,
    playing: options?.autoPlay ?? false,
  });
  const [speed, setSpeed] = useState<Speed>(1);
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
        const next = Math.min(SEQUENCE_SECONDS, clock.time + delta * speed);
        return { time: next, playing: next < SEQUENCE_SECONDS };
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
  }, [playing, speed]);

  const play = useCallback(() => {
    previousFrame.current = null;
    setClock((clock) => ({
      time: clock.time >= SEQUENCE_SECONDS ? 0 : clock.time,
      playing: true,
    }));
  }, []);

  const pause = useCallback(() => {
    previousFrame.current = null;
    setClock((clock) => ({ ...clock, playing: false }));
  }, []);

  const toggle = useCallback(() => {
    previousFrame.current = null;
    setClock((clock) => ({
      time: !clock.playing && clock.time >= SEQUENCE_SECONDS ? 0 : clock.time,
      playing: !clock.playing,
    }));
  }, []);

  const replay = useCallback(() => {
    previousFrame.current = null;
    setClock({ time: 0, playing: true });
  }, []);

  const reset = useCallback(() => {
    previousFrame.current = null;
    setClock({ time: 0, playing: false });
  }, []);

  const seek = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    previousFrame.current = null;
    const next = Math.max(0, Math.min(SEQUENCE_SECONDS, seconds));
    setClock((clock) => ({
      time: next,
      playing: clock.playing && next < SEQUENCE_SECONDS,
    }));
  }, []);

  const skipToReveal = useCallback(() => {
    previousFrame.current = null;
    setClock({ time: SKIP_TO, playing: false });
  }, []);

  const goToStage = useCallback((stage: Stage) => {
    previousFrame.current = null;
    setClock((clock) => ({ time: STAGE_START[stage], playing: clock.playing }));
  }, []);

  return {
    time,
    playing,
    speed,
    stage: stageAt(time),
    progress: progressAt(time),
    finished: time >= SEQUENCE_SECONDS,
    play,
    pause,
    toggle,
    replay,
    reset,
    skipToReveal,
    seek,
    goToStage,
    setSpeed,
  };
}
