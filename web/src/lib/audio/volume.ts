"use client";

import { useSyncExternalStore } from "react";

/**
 * One volume for everything AURALS plays: the A/B listening, the earphone
 * previews, the question examples, the song studio. Every live engine sends its
 * sound through `output(ctx)` — a gain on its way to the speakers — and that
 * gain follows this setting, gliding rather than stepping.
 *
 * The slider position is perceptual: gain = position², so the middle of the
 * slider sounds like the middle. Remembered per browser (a convenience, not
 * account data); a muted listener stays muted until they unmute.
 *
 * Level matching inside the A/B comparison is untouched: both sides pass
 * through the same master, so turning it down never favours either.
 */

type State = { level: number; muted: boolean };

const KEY = "aurals-volume";
const listeners = new Set<() => void>();
const outputs = new Map<BaseAudioContext, GainNode>();
let state: State = { level: 0.8, muted: false };
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<State> | null;
    if (saved && typeof saved.level === "number") {
      state = { level: Math.min(1, Math.max(0, saved.level)), muted: Boolean(saved.muted) };
    }
  } catch {
    /* private window or blocked storage: the default stands */
  }
}

/** The gain the setting stands for: perceptual, and silent when muted. */
export const gainOf = (s: State) => (s.muted ? 0 : s.level * s.level);

function apply() {
  const g = gainOf(state);
  for (const [ctx, node] of outputs) {
    // A player that closed its context is gone: forget it.
    if (ctx.state === "closed") outputs.delete(ctx);
    else node.gain.setTargetAtTime(g, ctx.currentTime, 0.04);
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* not remembered: fine */
  }
  for (const fn of listeners) fn();
}

export function getVolume(): State {
  load();
  return state;
}

export function setVolume(level: number) {
  load();
  state = { level: Math.min(1, Math.max(0, level)), muted: level <= 0.001 ? state.muted : false };
  apply();
}

export function setMuted(muted: boolean) {
  load();
  state = { ...state, muted };
  apply();
}

/** Where a live engine connects its output. Offline renders go straight to their destination. */
export function output(ctx: BaseAudioContext): AudioNode {
  if (typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext)
    return ctx.destination;
  load();
  let node = outputs.get(ctx);
  if (!node) {
    node = ctx.createGain();
    node.gain.value = gainOf(state);
    node.connect(ctx.destination);
    outputs.set(ctx, node);
  }
  return node;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const SERVER: State = { level: 0.8, muted: false };

export function useVolume(): State {
  return useSyncExternalStore(subscribe, getVolume, () => SERVER);
}
