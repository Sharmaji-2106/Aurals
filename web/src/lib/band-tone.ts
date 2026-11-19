import { output } from "@/lib/audio/volume";
/**
 * "Hear this band": a short burst of pink noise band-limited to one frequency band.
 * Only ever started by a click; quiet by design, with a soft attack and release.
 */
let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let stopCurrent: (() => void) | null = null;

function pinkNoise(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Paul Kellet's economy pink-noise filter.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.06;
  }
  return buffer;
}

export function playBand(low: number, high: number, onEnd?: () => void) {
  if (typeof window === "undefined") return () => {};
  stopCurrent?.();
  context ??= new AudioContext();
  const ctx = context;
  void ctx.resume();
  noise ??= pinkNoise(ctx, 2.2);

  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filters = [
    ...[0, 1].map(() => Object.assign(ctx.createBiquadFilter(), { type: "highpass" as BiquadFilterType })),
    ...[0, 1].map(() => Object.assign(ctx.createBiquadFilter(), { type: "lowpass" as BiquadFilterType })),
  ];
  filters.forEach((f, i) =>
    f.frequency.setValueAtTime(i < 2 ? low : Math.min(high, ctx.sampleRate / 2 - 100), ctx.currentTime),
  );

  // Narrow bands carry little of pink noise's energy; compensate, within limits.
  const octaves = Math.log2(high / low);
  const peak = Math.min(0.9, 0.22 * Math.sqrt(10 / octaves)) * (low < 60 ? 1.6 : 1);
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.08);
  gain.gain.setValueAtTime(peak, now + 1.5);
  gain.gain.linearRampToValueAtTime(0, now + 1.9);
  const limiter = ctx.createDynamicsCompressor();

  let node: AudioNode = source;
  for (const f of filters) {
    node.connect(f);
    node = f;
  }
  node.connect(gain).connect(limiter).connect(output(ctx));
  source.start(now);
  source.stop(now + 2);

  const stop = () => {
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      source.stop(ctx.currentTime + 0.1);
    } catch {
      // already stopped
    }
  };
  source.onended = () => {
    if (stopCurrent === stop) stopCurrent = null;
    onEnd?.();
  };
  stopCurrent = stop;
  return stop;
}
