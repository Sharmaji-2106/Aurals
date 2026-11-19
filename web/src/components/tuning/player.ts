"use client";

import { TONAL, type Offsets, type Tonal } from "@/components/tuning/adaptive";
import { output } from "@/lib/audio/volume";

/**
 * The listening engine for the shape picker and the tuning duel.
 *
 * One looping clip feeds two parallel chains, A and B. Each chain is six filters
 * — one per tonal dimension of the sound profile — then a loudness trim and a
 * fader. Switching sides is a 40 ms cross-fade while the music keeps playing, so
 * the comparison is instant and nothing restarts.
 *
 * **Level matching.** Louder sounds "better" in any A/B, so every tuning is
 * measured before it is heard: the clip is rendered offline through that chain
 * and its K-weighted loudness (the BS.1770 pre-filter, approximated with two
 * biquads) compared with the untouched clip; the trim makes them equal. A tuning
 * can only win on its shape.
 *
 * What the listener hears is a tonal change on whatever they are wearing — not a
 * simulation of any particular earphone. The UI says so.
 */

type Spec = { type: BiquadFilterType; frequency: number; q: number };

/** Where each tonal dimension lives, as a filter. */
export const EQ: Record<Tonal, Spec> = {
  sub_bass: { type: "lowshelf", frequency: 65, q: 0.7 },
  mid_bass: { type: "peaking", frequency: 170, q: 1.0 },
  warmth: { type: "peaking", frequency: 420, q: 0.9 },
  vocal_presence: { type: "peaking", frequency: 2600, q: 0.9 },
  treble: { type: "peaking", frequency: 6500, q: 0.9 },
  air: { type: "highshelf", frequency: 11000, q: 0.7 },
};

type Chain = { filters: BiquadFilterNode[]; trim: GainNode; fader: GainNode };
export type Side = "a" | "b";

const key = (o: Offsets) => TONAL.map((d) => o[d].toFixed(1)).join(",");

function chain(ctx: BaseAudioContext, offsets: Offsets) {
  const filters = TONAL.map((d) => {
    const f = ctx.createBiquadFilter();
    f.type = EQ[d].type;
    f.frequency.value = EQ[d].frequency;
    f.Q.value = EQ[d].q;
    f.gain.value = offsets[d];
    return f;
  });
  for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
  return filters;
}

/** K-weighted mean square of a buffer rendered through a chain (offline). */
async function loudness(buffer: AudioBuffer, offsets: Offsets): Promise<number> {
  const seconds = Math.min(8, buffer.duration);
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * buffer.sampleRate), buffer.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filters = chain(ctx, offsets);
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 1681;
  shelf.gain.value = 4;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 38;
  hp.Q.value = 0.5;
  src.connect(filters[0]);
  filters.at(-1)!.connect(shelf);
  shelf.connect(hp);
  hp.connect(ctx.destination);
  src.start(0, Math.max(0, buffer.duration / 2 - seconds / 2));
  const out = await ctx.startRendering();
  const data = out.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return sum / data.length;
}

export class TuningPlayer {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private readonly master: GainNode;
  private readonly chains: Record<Side, Chain>;
  private buffer: AudioBuffer | null = null;
  private source: { src: AudioBufferSourceNode; env: GainNode } | null = null;
  private reference: number | null = null;
  private readonly cache = new Map<string, Promise<number>>();
  private side: Side = "a";
  playing = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(this.analyser);
    this.analyser.connect(output(ctx));
    const make = (on: boolean): Chain => {
      const filters = chain(ctx, {
        sub_bass: 0,
        mid_bass: 0,
        warmth: 0,
        vocal_presence: 0,
        treble: 0,
        air: 0,
      });
      const trim = ctx.createGain();
      const fader = ctx.createGain();
      fader.gain.value = on ? 1 : 0;
      filters.at(-1)!.connect(trim);
      trim.connect(fader);
      fader.connect(this.master);
      return { filters, trim, fader };
    };
    this.chains = { a: make(true), b: make(false) };
  }

  /** The buffer now loaded: songs are swapped only when they differ. */
  get loaded(): AudioBuffer | null {
    return this.buffer;
  }

  async load(buffer: AudioBuffer) {
    this.stop();
    this.buffer = buffer;
    this.cache.clear();
    this.reference = null;
    const level = await loudness(buffer, {
      sub_bass: 0,
      mid_bass: 0,
      warmth: 0,
      vocal_presence: 0,
      treble: 0,
      air: 0,
    });
    // A later load may have replaced this one while it was being measured.
    if (this.buffer === buffer) this.reference = level;
  }

  get ready() {
    return this.buffer !== null;
  }

  play() {
    if (!this.buffer || this.playing) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    // Each source has its own envelope, so a new song fades in while the last
    // one fades out — a cross-fade between songs, not a cut through silence.
    const env = this.ctx.createGain();
    const now = this.ctx.currentTime;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(1, now + 0.35);
    src.connect(env);
    env.connect(this.chains.a.filters[0]);
    env.connect(this.chains.b.filters[0]);
    src.start();
    this.source = { src, env };
    this.playing = true;
  }

  stop() {
    if (!this.source) return;
    const { src, env } = this.source;
    const now = this.ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.linearRampToValueAtTime(0, now + 0.35);
    src.stop(now + 0.4);
    src.onended = () => env.disconnect();
    this.source = null;
    this.playing = false;
  }

  /** Shape a side's sound; the change glides, and its loudness is matched first. */
  async setTuning(side: Side, offsets: Offsets) {
    if (!this.buffer || this.reference === null) return;
    const id = key(offsets);
    let job = this.cache.get(id);
    if (!job) {
      job = loudness(this.buffer, offsets);
      this.cache.set(id, job);
    }
    const level = await job;
    const trim = Math.sqrt(this.reference / Math.max(level, 1e-12));
    const now = this.ctx.currentTime;
    const c = this.chains[side];
    TONAL.forEach((d, i) => c.filters[i].gain.setTargetAtTime(offsets[d], now, 0.08));
    c.trim.gain.setTargetAtTime(trim, now, 0.08);
  }

  /** Hear one side: a short cross-fade, the music never stops. */
  listen(side: Side) {
    this.side = side;
    const now = this.ctx.currentTime;
    this.chains.a.fader.gain.setTargetAtTime(side === "a" ? 1 : 0, now, 0.015);
    this.chains.b.fader.gain.setTargetAtTime(side === "b" ? 1 : 0, now, 0.015);
  }

  get heard(): Side {
    return this.side;
  }

  /** 0–1 loudness of what is playing now, for visuals. */
  level(bins: Uint8Array<ArrayBuffer>) {
    this.analyser.getByteFrequencyData(bins);
    let sum = 0;
    for (let i = 0; i < bins.length; i++) sum += bins[i];
    return sum / (bins.length * 255);
  }

  dispose() {
    this.stop();
    this.master.disconnect();
    this.analyser.disconnect();
  }
}

/** Decode the clip from the API, or fall back to the synthesised bed. */
export async function loadClip(ctx: AudioContext, url: string | null): Promise<AudioBuffer> {
  if (url) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (res.ok) return ctx.decodeAudioData(await res.arrayBuffer());
  }
  const { render } = await import("@/lib/audio/engine");
  return render(ctx.sampleRate);
}
