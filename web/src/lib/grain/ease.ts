"use client";

/** Easing shared by the grain sequence and the studio that designed it. */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Smoothstep across a window of a 0-1 clock; 0 before `from`, 1 after `to`. */
export function span(t: number, from: number, to: number) {
  const x = clamp((t - from) / (to - from));
  return x * x * (3 - 2 * x);
}

/** A window that rises, holds, then falls — for anything that passes through. */
export function pulse(t: number, from: number, peak: number, to: number) {
  return t < peak ? span(t, from, peak) : 1 - span(t, peak, to);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeInExpo = (x: number) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
export const easeInOutQuart = (x: number) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2);
