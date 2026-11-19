"use client";

import { SPECTRAL_STOPS } from "@/lib/bands";
import { bandPath, type Point } from "@/lib/scale";
import { useElementSize } from "@/lib/use-element-size";
import { motion } from "motion/react";
import { useId } from "react";

/**
 * Illustrations for the non-tonal questions, responding to the answer being chosen: a
 * waveform for energy, detail and naturalness, a stereo stage for space. Tonal questions
 * are shown directly on the live sound curve instead. Purely explanatory.
 */
const H = 170;
const ease = [0.16, 1, 0.3, 1] as const;

const STAGE_QUESTIONS = new Set(["soundstage"]);

/** Map an answer to a -1..1 intensity (neutral = 0). */
function intensity(value: string | null | undefined) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? (n - 3) / 2 : 0;
}

const WAVE_POINTS = 220;

/** Envelope of a stylised audio waveform, 0..1, for the "wave" illustrations. */
function waveEnvelope(questionId: string, v: number, t: number) {
  const u = (v + 1) / 2; // 0..1
  const texture = 0.55 + 0.45 * Math.abs(Math.sin(t * 131) * Math.cos(t * 37));
  if (questionId === "energy") {
    const beats = 4 + Math.round(u * 4);
    const phase = (t * beats) % 1;
    const hit = Math.exp(-phase * (3 + 9 * u));
    return (0.12 + 0.18 * u + (0.25 + 0.55 * u) * hit) * texture;
  }
  if (questionId === "detail") {
    const body = 0.45 + 0.12 * Math.sin(t * 7);
    const fine = 1 - (0.1 + 0.6 * u) * (0.5 + 0.5 * Math.sin(t * 420));
    return body * (0.75 + 0.25 * texture) * fine;
  }
  // naturalness: blocky, synthetic sustain -> plucked notes that bloom and decay
  const phase = (t * 5) % 1;
  const block = phase < 0.8 ? 0.62 : 0.05;
  const pluck = Math.exp(-phase * 4.5) * Math.min(1, phase * 40) * 0.85;
  return ((1 - u) * block + u * pluck) * (0.8 + 0.2 * texture);
}

function waveBand(questionId: string, v: number, width: number): [Point[], Point[]] {
  const upper: Point[] = [];
  const lower: Point[] = [];
  const amp = H * 0.46;
  for (let i = 0; i < WAVE_POINTS; i++) {
    const t = i / (WAVE_POINTS - 1);
    const edge = Math.min(1, t * 30, (1 - t) * 30);
    const e = waveEnvelope(questionId, v, t) * edge;
    upper.push([t * width, H / 2 - e * amp]);
    lower.push([t * width, H / 2 + e * amp]);
  }
  return [upper, lower];
}

export function QuestionVisual({
  questionId,
  value,
}: {
  questionId: string;
  value: string | null | undefined;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const id = useId();
  const v = intensity(value);

  return (
    <div ref={ref} className="relative h-[170px] w-full" aria-hidden="true">
      {width > 0 && (
        <svg width={width} height={H} className="overflow-visible">
          <defs>
            <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="0" x2={width} y1="0" y2="0">
              {SPECTRAL_STOPS.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          {STAGE_QUESTIONS.has(questionId) ? (
            <Stage width={width} spread={(v + 1) / 2} gradient={`url(#${id}-g)`} />
          ) : (
            <Waveform band={waveBand(questionId, v, width)} gradient={`url(#${id}-g)`} />
          )}
        </svg>
      )}
    </div>
  );
}

function Waveform({ band, gradient }: { band: [Point[], Point[]]; gradient: string }) {
  const d = bandPath(band[0], band[1], 0.2);
  return (
    <motion.path
      initial={false}
      animate={{ d }}
      transition={{ duration: 0.9, ease }}
      fill={gradient}
      fillOpacity={0.85}
      style={{ filter: "drop-shadow(0 0 14px rgb(255 255 255 / 0.12))" }}
    />
  );
}

function Stage({ width, spread, gradient }: { width: number; spread: number; gradient: string }) {
  const cx = width / 2;
  const listenerY = H - 14;
  const span = (0.18 + 0.3 * spread) * width;
  const sources = [-1, -0.5, 0, 0.5, 1];
  return (
    <>
      {[1, 2, 3].map((k) => {
        // Upper half-ellipses: the stage in front of the listener.
        const rx = (span * k) / 3 + 10;
        const ry = ((listenerY - 24) * k) / 3;
        return (
          <motion.path
            key={k}
            initial={false}
            animate={{ d: `M${cx - rx},${listenerY} A${rx},${ry} 0 0 1 ${cx + rx},${listenerY}` }}
            transition={{ duration: 0.9, ease }}
            fill="none"
            stroke={gradient}
            strokeOpacity={0.55 - k * 0.12}
          />
        );
      })}
      <line
        x1={cx - span - 20}
        x2={cx + span + 20}
        y1={listenerY}
        y2={listenerY}
        stroke="white"
        strokeOpacity={0.06}
      />
      {sources.map((s, i) => (
        <motion.circle
          key={s}
          initial={false}
          animate={{ cx: cx + s * span, cy: 30 + Math.abs(s) * 26 * (1 - spread) + (i % 2) * 8 }}
          transition={{ duration: 0.9, ease }}
          r={5}
          fill={SPECTRAL_STOPS[i * 2]?.color ?? "white"}
        />
      ))}
      <circle cx={cx} cy={listenerY} r={6} fill="#eeebe5" />
      <circle cx={cx} cy={listenerY} r={12} fill="none" stroke="white" strokeOpacity={0.2} />
    </>
  );
}
