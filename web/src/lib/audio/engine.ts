"use client";

/**
 * The questionnaire's listening examples.
 *
 * Auralis stores no audio: a listener's own music is deleted as soon as it has been
 * measured, and the project ships no sound files. So the examples are synthesised in
 * the browser — a short reference bed built from oscillators and filtered noise — and
 * the A/B pairs are that same bed through real `BiquadFilterNode` chains.
 *
 * Two consequences worth stating plainly, because the UI says them too:
 *
 * * What you hear is a tonal change played through whatever you are listening on. It
 *   is not a simulation of any particular earphone.
 * * Variants are level-matched by broadband RMS against the unfiltered bed, so a
 *   louder version cannot win the comparison on loudness alone. RMS is a blunter
 *   instrument than BS.1770, but on one fixed five-second bed it is honest enough.
 */

export type Filter = {
  type: BiquadFilterType;
  frequency: number;
  gain?: number;
  q?: number;
};

const BPM = 84;
const BEAT = 60 / BPM;
const BARS = 2;
/** Derived from the tempo, so the bed is a whole number of bars and loops seamlessly. */
export const BED_SECONDS = BARS * BEAT * 4;

let live: AudioContext | null = null;
let liveFailed = false;
const rendered = new Map<string, Promise<AudioBuffer>>();

/**
 * The shared output context. Browsers only allow this from a user gesture, so every
 * caller must come from a click; a refusal returns null and the caller degrades to a
 * questionnaire with no player rather than a broken one.
 */
export function audioContext(): AudioContext | null {
  if (live || liveFailed) return live;
  try {
    live = new AudioContext();
  } catch {
    liveFailed = true;
    return null;
  }
  return live;
}

const key = (filters: Filter[]) =>
  filters.map((f) => `${f.type}:${f.frequency}:${f.gain ?? 0}:${f.q ?? 0}`).join("|") || "flat";

/** Deterministic noise, so every render of the bed is byte-for-byte the same one. */
function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let i = 0; i < data.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    data[i] = (state / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function envelope(gain: GainNode, at: number, peak: number, attack: number, decay: number) {
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

/**
 * A short musical bed with real content in every region the questions ask about:
 * a kick and a bass line for the lows, a sustained chord with vibrato through the
 * vocal range, hats and a shaker for the highs.
 */
function buildBed(ctx: OfflineAudioContext) {
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);

  const roots = [55, 55, 49, 61.74]; // A1, A1, G1, B1 — one slow turn

  for (let bar = 0; bar < BARS; bar++) {
    const barAt = bar * BEAT * 4;
    const root = roots[bar % roots.length];

    // Kick: a sine dropping from the thump into the sub, on 1 and 3.
    for (const beat of [0, 2]) {
      const at = barAt + beat * BEAT;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(120, at);
      osc.frequency.exponentialRampToValueAtTime(44, at + 0.09);
      envelope(gain, at, 0.95, 0.006, 0.34);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + 0.5);
    }

    // Bass: two harmonics through a lowpass, one note per half bar.
    for (const beat of [0, 2]) {
      const at = barAt + beat * BEAT;
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 420;
      low.Q.value = 0.7;
      const gain = ctx.createGain();
      envelope(gain, at, 0.42, 0.02, BEAT * 1.95);
      low.connect(gain).connect(out);
      for (const [mult, level] of [
        [1, 1],
        [2, 0.4],
        [3, 0.16],
      ]) {
        const osc = ctx.createOscillator();
        const partial = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = root * mult;
        partial.gain.value = level;
        osc.connect(partial).connect(low);
        osc.start(at);
        osc.stop(at + BEAT * 2);
      }
    }

    // A chord sitting where voices sit, restruck mid-bar and given a little vibrato
    // so it reads as something played rather than a test tone.
    const chord = [4, 5, 6, 8].map((n) => root * n); // 220, 275, 330, 440 over A1
    for (const beat of [0, 2]) {
      chord.forEach((hz, i) => {
        const at = barAt + beat * BEAT + 0.02;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const vibrato = ctx.createOscillator();
        const depth = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = hz;
        vibrato.frequency.value = 4.6 + i * 0.3;
        depth.gain.value = hz * 0.004;
        vibrato.connect(depth).connect(osc.frequency);
        envelope(gain, at, 0.16 - i * 0.024, 0.12, BEAT * 1.95);
        osc.connect(gain).connect(out);
        osc.start(at);
        vibrato.start(at);
        osc.stop(at + BEAT * 2.1);
        vibrato.stop(at + BEAT * 2.1);
      });
    }

    // Hats on the eighths, and a quiet shaker above them for air.
    for (let eighth = 0; eighth < 8; eighth++) {
      const at = barAt + eighth * BEAT * 0.5;
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx, 0.12, 97 + bar * 8 + eighth);
      const high = ctx.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = eighth % 2 === 0 ? 6500 : 9000;
      const gain = ctx.createGain();
      envelope(gain, at, eighth % 2 === 0 ? 0.3 : 0.16, 0.002, 0.055);
      source.connect(high).connect(gain).connect(out);
      source.start(at);
      source.stop(at + 0.12);
    }
  }
}

function rms(buffer: AudioBuffer) {
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    n += data.length;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

function scale(buffer: AudioBuffer, gain: number) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }
  // Headroom: matching levels must never be allowed to clip.
  if (peak > 0.99) scale(buffer, 0.99 / peak);
}

async function renderBuffer(sampleRate: number, filters: Filter[]) {
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * BED_SECONDS), sampleRate);
  buildBed(ctx);
  const buffer = await ctx.startRendering();
  if (!filters.length) return buffer;

  const shaped = new OfflineAudioContext(1, buffer.length, sampleRate);
  const source = shaped.createBufferSource();
  source.buffer = buffer;
  let node: AudioNode = source;
  for (const spec of filters) {
    const filter = shaped.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.value = spec.frequency;
    if (spec.gain !== undefined) filter.gain.value = spec.gain;
    if (spec.q !== undefined) filter.Q.value = spec.q;
    node = node.connect(filter);
  }
  node.connect(shaped.destination);
  source.start();
  const out = await shaped.startRendering();
  scale(out, rms(buffer) / Math.max(1e-6, rms(out)));
  return out;
}

/** The bed through `filters`, level-matched to the unfiltered bed. Cached per chain. */
export function render(sampleRate: number, filters: Filter[] = []): Promise<AudioBuffer> {
  const id = `${sampleRate}#${key(filters)}`;
  let job = rendered.get(id);
  if (!job) {
    job = renderBuffer(sampleRate, filters);
    rendered.set(id, job);
  }
  return job;
}

/**
 * Envelope of a rendered buffer, for a waveform that matches what is heard.
 *
 * RMS per bin rather than peak: a kick transient is a few samples tall and peak
 * binning would draw the whole passage as a row of spikes with nothing between them.
 * The square root afterwards is a display curve, so the quiet half is still legible.
 */
export function peaks(buffer: AudioBuffer, bins: number): number[] {
  const data = buffer.getChannelData(0);
  const per = Math.floor(data.length / bins);
  const out: number[] = [];
  let loudest = 0;
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    let n = 0;
    for (let i = b * per; i < (b + 1) * per && i < data.length; i++, n++) sum += data[i] * data[i];
    const level = Math.sqrt(sum / Math.max(1, n));
    out.push(level);
    loudest = Math.max(loudest, level);
  }
  return out.map((v) => Math.sqrt(v / Math.max(1e-6, loudest)));
}

const decoded = new Map<string, Promise<AudioBuffer>>();

/** A clip from the listener's own music, decoded once per address. */
export function loadExample(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  let job = decoded.get(url);
  if (!job) {
    job = fetch(url, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`example ${r.status}`);
        return r.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes));
    // A failed fetch should be retried next time, not remembered.
    job.catch(() => decoded.delete(url));
    decoded.set(url, job);
  }
  return job;
}

const shapedClips = new WeakMap<AudioBuffer, Map<string, Promise<AudioBuffer>>>();

/**
 * A clip through `filters`, level-matched to the clip as it was, exactly as the
 * synthesised bed is: so the louder of two treatments never wins for being louder.
 */
export function renderClip(buffer: AudioBuffer, filters: Filter[]): Promise<AudioBuffer> {
  let jobs = shapedClips.get(buffer);
  if (!jobs) {
    jobs = new Map();
    shapedClips.set(buffer, jobs);
  }
  const id = key(filters);
  let job = jobs.get(id);
  if (!job) {
    job = (async () => {
      if (!filters.length) return buffer;
      const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      let node: AudioNode = source;
      for (const spec of filters) {
        const filter = ctx.createBiquadFilter();
        filter.type = spec.type;
        filter.frequency.value = spec.frequency;
        if (spec.gain !== undefined) filter.gain.value = spec.gain;
        if (spec.q !== undefined) filter.Q.value = spec.q;
        node = node.connect(filter);
      }
      node.connect(ctx.destination);
      source.start();
      const out = await ctx.startRendering();
      scale(out, rms(buffer) / Math.max(1e-6, rms(out)));
      return out;
    })();
    jobs.set(id, job);
  }
  return job;
}
