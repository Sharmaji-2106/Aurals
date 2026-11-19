"use client";

/**
 * One clock for every concept in the studio.
 *
 * Each concept reads a single normalised position and derives its whole scene from
 * it, so scrubbing, pausing and slowing down are exact rather than approximate, and
 * a replay is a seek to zero rather than a teardown. Frames are pushed to
 * subscribers directly; React state is only touched a few times a second, for the
 * controls, so a 60 fps scene never re-renders the page around it.
 */

export const DURATION_MS = 9600;

export const STAGES = [
  { key: "arrival", label: "Arrival", at: 0, note: "The playlist appears" },
  { key: "motion", label: "Motion", at: 0.17, note: "The concept takes over" },
  { key: "expansion", label: "Expansion", at: 0.45, note: "It grows and lets go" },
  { key: "transition", label: "Transition", at: 0.66, note: "Form becomes object" },
  { key: "listening", label: "Listening", at: 0.81, note: "Listening to your music" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export function stageAt(t: number): StageKey {
  let current: StageKey = STAGES[0].key;
  for (const stage of STAGES) if (t >= stage.at) current = stage.key;
  return current;
}

type Frame = (t: number) => void;

export class Sequence {
  private frames = new Set<Frame>();
  private raf = 0;
  private last = 0;
  private _t = 0;
  private _playing = false;
  private _speed = 1;
  /** Notified on play/pause/seek only, so the controls can re-render. */
  private states = new Set<() => void>();

  get t() {
    return this._t;
  }
  get playing() {
    return this._playing;
  }
  get speed() {
    return this._speed;
  }

  setSpeed(value: number) {
    this._speed = value;
    this.changed();
  }

  /** Subscribe to play/pause/seek. Returns an unsubscribe. */
  onState(listener: () => void) {
    this.states.add(listener);
    return () => {
      this.states.delete(listener);
    };
  }

  private changed() {
    for (const listener of this.states) listener();
  }

  /** Subscribe to every frame. Returns an unsubscribe. Fires once immediately. */
  watch(frame: Frame) {
    this.frames.add(frame);
    frame(this._t);
    return () => {
      this.frames.delete(frame);
    };
  }

  private emit() {
    for (const frame of this.frames) frame(this._t);
  }

  seek(t: number) {
    this._t = Math.min(1, Math.max(0, t));
    this.emit();
    this.changed();
  }

  play() {
    if (this._playing) return;
    // Reaching the end and pressing play reads as "again", not as a dead button.
    if (this._t >= 1) this._t = 0;
    this._playing = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.changed();
  }

  pause() {
    if (!this._playing) return;
    this._playing = false;
    cancelAnimationFrame(this.raf);
    this.changed();
  }

  toggle() {
    if (this._playing) this.pause();
    else this.play();
  }

  replay() {
    this._t = 0;
    this.emit();
    if (!this._playing) this.play();
    else this.changed();
  }

  /**
   * Safe to call more than once. React's development double-invoke tears an
   * effect down and sets it up again on the same instance, so a dispose that
   * cancelled the frame loop without clearing `playing` would leave the clock
   * permanently stopped while still believing it was running.
   */
  dispose() {
    cancelAnimationFrame(this.raf);
    this._playing = false;
    this.frames.clear();
    this.states.clear();
  }

  private tick = (now: number) => {
    // A tab that was backgrounded must not jump the scene forward.
    const dt = Math.min(64, now - this.last);
    this.last = now;
    this._t += (dt * this._speed) / DURATION_MS;
    if (this._t >= 1) {
      this._t = 1;
      this._playing = false;
      this.emit();
      this.changed();
      return;
    }
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };
}

/* ---------------------------------------------------------------- easing --- */

export { clamp, easeInExpo, easeInOutQuart, easeOutExpo, lerp, pulse, span } from "@/lib/grain/ease";
