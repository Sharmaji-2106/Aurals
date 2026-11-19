"use client";

import { T, TURNS } from "@/components/book/contract";
import { useEffect, useRef } from "react";
import { output } from "@/lib/audio/volume";

/**
 * Sound for the edition: optional, quiet, and synthesised.
 *
 * Everything here is made by Web Audio at the moment it plays — no recordings,
 * so nothing to license and nothing to download. It is off until the viewer
 * turns it on (which is also what browsers require before audio may start).
 *
 * Restraint is the brief: a low tone as the terrace appears, the board's soft
 * landing, paper for each leaf, a single bell as the camera arrives on the
 * product, a breath of air as the light changes to the app's. No booms, and no
 * whoosh on every move.
 *
 * Cues fire when the clock *passes* them in ordinary playback. A scrub, a skip
 * or a replay jumps the clock without passing through, so it sounds nothing.
 */

type Cue = { at: number; play: (ctx: AudioContext, out: AudioNode) => void };

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buffer;
}

function envelope(ctx: AudioContext, gain: GainNode, peak: number, attack: number, decay: number) {
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Paper: band-passed noise with a quick swell and a soft tail. */
function paper(ctx: AudioContext, out: AudioNode, level: number, length: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, length + 0.1);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 3200 + Math.random() * 1400;
  band.Q.value = 0.7;
  const gain = ctx.createGain();
  envelope(ctx, gain, level, length * 0.35, length * 0.65);
  src.connect(band).connect(gain).connect(out);
  src.start();
}

function landing(ctx: AudioContext, out: AudioNode) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(92, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(54, ctx.currentTime + 0.25);
  const gain = ctx.createGain();
  envelope(ctx, gain, 0.22, 0.008, 0.32);
  osc.connect(gain).connect(out);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.2);
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 700;
  const g2 = ctx.createGain();
  envelope(ctx, g2, 0.08, 0.004, 0.12);
  src.connect(low).connect(g2).connect(out);
  src.start();
}

function bell(ctx: AudioContext, out: AudioNode) {
  for (const [freq, level, decay] of [
    [659.25, 0.07, 2.6],
    [988.0, 0.035, 2.0],
    [1318.5, 0.02, 1.4],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    envelope(ctx, gain, level, 0.012, decay);
    osc.connect(gain).connect(out);
    osc.start();
    osc.stop(ctx.currentTime + decay + 0.1);
  }
}

function air(ctx: AudioContext, out: AudioNode) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 1.4);
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 6000;
  const gain = ctx.createGain();
  envelope(ctx, gain, 0.045, 0.5, 0.8);
  src.connect(high).connect(gain).connect(out);
  src.start();
}

/** The room: two low, slightly detuned tones, swelling in and held. */
function room(ctx: AudioContext, out: AudioNode) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.2);
  gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 8);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 13.5);
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 420;
  for (const freq of [55, 82.6, 110.4]) {
    const osc = ctx.createOscillator();
    osc.type = freq > 100 ? "triangle" : "sine";
    osc.frequency.value = freq;
    osc.connect(low);
    osc.start();
    osc.stop(ctx.currentTime + 13.6);
  }
  low.connect(gain).connect(out);
}

const CUES: Cue[] = [
  { at: 0.02, play: room },
  // The board lands at 86% of its span (see coverAt).
  { at: T.cover[0] + (T.cover[1] - T.cover[0]) * 0.86, play: landing },
  { at: T.cover[0] + 0.1, play: (ctx, out) => paper(ctx, out, 0.03, 0.5) },
  ...TURNS.map((turn, i) => ({
    at: turn.start + 0.05,
    play: (ctx: AudioContext, out: AudioNode) =>
      paper(ctx, out, i < 3 || i === TURNS.length - 1 ? 0.055 : 0.03, Math.min(0.55, turn.duration * 0.6)),
  })),
  { at: T.push[1] - 0.2, play: bell },
  { at: T.theme[0] + 0.1, play: air },
];

export function useBookSound(time: number, playing: boolean, enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const outRef = useRef<GainNode | null>(null);
  const last = useRef(time);

  useEffect(() => {
    if (!enabled) return;
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(output(ctx));
    ctxRef.current = ctx;
    outRef.current = out;
    return () => {
      ctxRef.current = null;
      outRef.current = null;
      void ctx.close();
    };
  }, [enabled]);

  useEffect(() => {
    const prev = last.current;
    last.current = time;
    const ctx = ctxRef.current;
    const out = outRef.current;
    if (!ctx || !out || !playing) return;
    // Only an ordinary step of the clock plays a cue; a jump does not.
    const step = time - prev;
    if (step <= 0 || step > 0.25) return;
    for (const cue of CUES) {
      if (cue.at > prev && cue.at <= time) cue.play(ctx, out);
    }
  }, [time, playing]);
}
