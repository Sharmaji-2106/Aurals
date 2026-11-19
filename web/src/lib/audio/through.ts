"use client";

/**
 * Music through an earphone's measured tuning.
 *
 * The server sends a gain curve (`/api/store/products/{slug}/listen`): the
 * earphone's measured response minus a baseline — the listener's own earphones
 * when those are measured on the same rig, otherwise the reference target. Here
 * that curve becomes a linear-phase FIR filter (built directly from the curve,
 * so any shape is followed, not just what a handful of biquads can fit), a clip
 * is rendered through it offline, and the result is:
 *
 * * **aligned** — the filter's delay is removed, so the shaped clip lines up
 *   sample for sample with the original and the two can be switched at the same
 *   playhead without a hiccup;
 * * **level-matched** by K-weighted loudness (the BS.1770 pre-filter,
 *   approximated with two biquads, as the tuning duel does), so a tuning can't
 *   win by being louder. Peaks are held under full scale.
 *
 * It is a frequency response and nothing else; the UI says what it can't be.
 */

export type ListeningCurve = { freqs_hz: number[]; gain_db: number[] };

/** Long enough to shape the bass properly (~6 Hz bins at 48 kHz). */
const TAPS = 8192;

/** Gain (dB) at `hz`, linear in log-frequency, held at the ends. */
function gainAt(curve: ListeningCurve, hz: number) {
  const f = curve.freqs_hz;
  const g = curve.gain_db;
  if (hz <= f[0]) return g[0];
  if (hz >= f[f.length - 1]) return g[g.length - 1];
  const x = Math.log10(hz);
  let lo = 0;
  let hi = f.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f[mid] <= hz) lo = mid;
    else hi = mid;
  }
  const a = Math.log10(f[lo]);
  const b = Math.log10(f[hi]);
  return g[lo] + ((g[hi] - g[lo]) * (x - a)) / (b - a);
}

const firs = new Map<string, Float32Array>();

/**
 * A linear-phase FIR whose magnitude follows `curve`: a zero-phase spectrum,
 * inverse-transformed by a cosine sum (a table makes it ~20 ms), centred and
 * Blackman-windowed.
 */
export function firFor(curve: ListeningCurve, sampleRate: number, taps = TAPS): Float32Array {
  const id = `${sampleRate}:${taps}:${curve.gain_db.join(",")}`;
  const cached = firs.get(id);
  if (cached) return cached;
  const half = taps / 2;
  const amp = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    const hz = (k * sampleRate) / taps;
    amp[k] = k === 0 ? 10 ** (gainAt(curve, 20) / 20) : 10 ** (gainAt(curve, hz) / 20);
  }
  const cos = new Float64Array(taps);
  for (let m = 0; m < taps; m++) cos[m] = Math.cos((2 * Math.PI * m) / taps);
  const out = new Float32Array(taps);
  // Zero phase makes the response symmetric about its centre: compute one side.
  for (let t = 0; t <= half; t++) {
    let sum = amp[0] + amp[half] * (t % 2 === 0 ? 1 : -1);
    let m = 0;
    for (let k = 1; k < half; k++) {
      m += t;
      if (m >= taps) m -= taps;
      sum += 2 * amp[k] * cos[m];
    }
    const w = 0.42 + 0.5 * Math.cos((Math.PI * t) / half) + 0.08 * Math.cos((2 * Math.PI * t) / half);
    const v = (sum / taps) * w;
    out[half - t] = v;
    if (half + t < taps) out[half + t] = v;
  }
  firs.set(id, out);
  return out;
}

/** K-weighted mean square of a buffer (offline). */
async function kLoudness(buffer: AudioBuffer): Promise<number> {
  const ctx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 1681;
  shelf.gain.value = 4;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 38;
  hp.Q.value = 0.5;
  src.connect(shelf).connect(hp).connect(ctx.destination);
  src.start();
  const data = (await ctx.startRendering()).getChannelData(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return sum / Math.max(1, data.length);
}

const shaped = new WeakMap<AudioBuffer, Map<string, Promise<AudioBuffer>>>();
const reference = new WeakMap<AudioBuffer, Promise<number>>();

/** `buffer` through `curve`: aligned with it, and as loud as it. Cached per pair. */
export function through(buffer: AudioBuffer, curve: ListeningCurve, id: string): Promise<AudioBuffer> {
  let jobs = shaped.get(buffer);
  if (!jobs) {
    jobs = new Map();
    shaped.set(buffer, jobs);
  }
  const existing = jobs.get(id);
  if (existing) return existing;
  const job = (async () => {
    const fir = firFor(curve, buffer.sampleRate);
    const delay = fir.length / 2;
    const channels = buffer.numberOfChannels;
    const ctx = new OfflineAudioContext(channels, buffer.length + delay, buffer.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const conv = ctx.createConvolver();
    conv.normalize = false;
    const ir = ctx.createBuffer(1, fir.length, buffer.sampleRate);
    ir.getChannelData(0).set(fir);
    conv.buffer = ir;
    src.connect(conv).connect(ctx.destination);
    src.start();
    const rendered = await ctx.startRendering();

    const out = new AudioBuffer({
      numberOfChannels: channels,
      length: buffer.length,
      sampleRate: buffer.sampleRate,
    });
    for (let c = 0; c < channels; c++) {
      const from = rendered.getChannelData(Math.min(c, rendered.numberOfChannels - 1));
      out.getChannelData(c).set(from.subarray(delay, delay + buffer.length));
    }
    let ref = reference.get(buffer);
    if (!ref) {
      ref = kLoudness(buffer);
      reference.set(buffer, ref);
    }
    const [want, have] = await Promise.all([ref, kLoudness(out)]);
    let gain = Math.sqrt(want / Math.max(1e-12, have));
    let peak = 0;
    for (let c = 0; c < channels; c++) {
      const data = out.getChannelData(c);
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak * gain > 0.98) gain = 0.98 / peak;
    for (let c = 0; c < channels; c++) {
      const data = out.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] *= gain;
    }
    return out;
  })();
  job.catch(() => jobs.delete(id));
  jobs.set(id, job);
  return job;
}
