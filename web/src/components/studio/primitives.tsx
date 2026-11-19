"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef, type CSSProperties } from "react";
import { HEADPHONE, SPECTRAL_STOPS, cover, type Art } from "./material";
import { clamp, easeOutExpo, span, type Sequence } from "./sequence";

/** Subscribe a scene to the studio clock. The callback runs on every frame. */
export function useFrame(seq: Sequence, frame: (t: number) => void) {
  const latest = useRef(frame);
  useEffect(() => {
    latest.current = frame;
  });
  useEffect(() => seq.watch((t) => latest.current(t)), [seq]);
}

/* ------------------------------------------------------------- artwork --- */

/**
 * A cover. Plain `img` rather than `next/image`: these are fixed-size decorative
 * tiles inside an animation, and the optimiser's wrapper markup gets in the way of
 * the transforms each concept applies.
 */
export function Cover({ art, className, style }: { art: Art; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn("relative block overflow-hidden bg-elevated", className)}
      style={style}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover(art)}
        alt=""
        loading="eager"
        decoding="async"
        draggable={false}
        className="size-full object-cover"
      />
    </span>
  );
}

/* ---------------------------------------------------------- headphones --- */

export type HeadphoneVariant = "trace" | "rings" | "filament" | "solid";

/**
 * The silhouette every concept resolves into, under four treatments.
 *
 * `trace` draws it as a line; `rings` lets the cups arrive as collapsing circles;
 * `filament` is one continuous luminous stroke; `solid` gives it mass and a lit
 * rim. The geometry never changes, so the treatments stay comparable.
 */
export function Headphones({
  seq,
  variant,
  from,
  to,
  className,
}: {
  seq: Sequence;
  variant: HeadphoneVariant;
  from: number;
  to: number;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const band = useRef<SVGPathElement>(null);
  const cups = useRef<SVGGElement>(null);
  const rings = useRef<SVGGElement>(null);

  useFrame(seq, (t) => {
    const reveal = span(t, from, to);
    const settle = span(t, from + (to - from) * 0.55, to + 0.06);
    if (root.current) {
      root.current.style.opacity = String(clamp(reveal * 1.1));
      // Arrives a touch large and settles, the way a lens finds focus.
      const scale = 1.06 - 0.06 * easeOutExpo(reveal);
      root.current.style.transform = `translate3d(0,${(1 - settle) * 8}px,0) scale(${scale})`;
    }
    if (band.current) {
      const length = band.current.getTotalLength?.() ?? 260;
      band.current.style.strokeDasharray = `${length}`;
      band.current.style.strokeDashoffset = `${length * (1 - easeOutExpo(reveal))}`;
    }
    if (cups.current) {
      cups.current.style.opacity = String(span(t, from + (to - from) * 0.35, to));
      const grow = span(t, from + (to - from) * 0.35, to);
      cups.current.style.transform = `scale(${0.82 + 0.18 * easeOutExpo(grow)})`;
      cups.current.style.transformOrigin = "120px 133px";
    }
    if (rings.current) {
      const collapse = span(t, from, to);
      rings.current.style.opacity = String(1 - collapse);
      rings.current.style.transform = `scale(${1 + (1 - collapse) * 1.9})`;
      rings.current.style.transformOrigin = "120px 133px";
    }
  });

  const stroke = variant === "filament" ? 2.2 : variant === "solid" ? 1.4 : 2.6;

  return (
    <div ref={root} className={cn("will-change-transform", className)} style={{ opacity: 0 }}>
      <svg viewBox={HEADPHONE.viewBox} fill="none" className="size-full overflow-visible">
        <defs>
          <linearGradient
            id={`hp-${variant}`}
            x1="30"
            y1="150"
            x2="210"
            y2="30"
            gradientUnits="userSpaceOnUse"
          >
            {SPECTRAL_STOPS.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
          <radialGradient id={`hp-driver-${variant}`} cx="0.5" cy="0.4" r="0.6">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {variant === "filament" && (
            <filter id="hp-bloom" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        {/* Treatment-specific: circles that fall in from outside and become cups. */}
        {variant === "rings" && (
          <g ref={rings} opacity="0">
            <circle
              cx={HEADPHONE.driverLeft.cx}
              cy={HEADPHONE.driverLeft.cy}
              r="26"
              stroke={`url(#hp-${variant})`}
              strokeWidth="1"
              opacity="0.5"
            />
            <circle
              cx={HEADPHONE.driverRight.cx}
              cy={HEADPHONE.driverRight.cy}
              r="26"
              stroke={`url(#hp-${variant})`}
              strokeWidth="1"
              opacity="0.5"
            />
          </g>
        )}

        <g filter={variant === "filament" ? "url(#hp-bloom)" : undefined}>
          <path
            ref={band}
            d={HEADPHONE.band}
            stroke={`url(#hp-${variant})`}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <g ref={cups} opacity="0">
            {variant === "solid" ? (
              <>
                <path
                  d={HEADPHONE.cupLeft}
                  fill="#0d0d10"
                  stroke={`url(#hp-${variant})`}
                  strokeWidth={stroke}
                />
                <path
                  d={HEADPHONE.cupRight}
                  fill="#0d0d10"
                  stroke={`url(#hp-${variant})`}
                  strokeWidth={stroke}
                />
                <circle {...HEADPHONE.driverLeft} fill={`url(#hp-driver-${variant})`} opacity="0.5" />
                <circle {...HEADPHONE.driverRight} fill={`url(#hp-driver-${variant})`} opacity="0.5" />
              </>
            ) : (
              <>
                <path d={HEADPHONE.cupLeft} stroke={`url(#hp-${variant})`} strokeWidth={stroke} />
                <path d={HEADPHONE.cupRight} stroke={`url(#hp-${variant})`} strokeWidth={stroke} />
                <circle {...HEADPHONE.driverLeft} r={3} fill="#eeebe5" opacity="0.75" />
                <circle {...HEADPHONE.driverRight} r={3} fill="#eeebe5" opacity="0.75" />
              </>
            )}
          </g>
        </g>
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------- the words --- */

export type ListeningVariant = "centred" | "lower" | "wide" | "editorial" | "tight";

/**
 * "Listening to your music", set five ways.
 *
 * The words arrive after the object they belong to, never with it: the headphones
 * are the anchor and the line is the caption.
 */
export function Listening({
  seq,
  variant,
  from,
  count,
  className,
}: {
  seq: Sequence;
  variant: ListeningVariant;
  from: number;
  count?: number;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLSpanElement>(null);

  useFrame(seq, (t) => {
    const show = span(t, from, from + 0.1);
    if (root.current) {
      root.current.style.opacity = String(show);
      root.current.style.transform = `translate3d(0,${(1 - easeOutExpo(show)) * 14}px,0)`;
    }
    if (rule.current) rule.current.style.transform = `scaleX(${span(t, from + 0.02, from + 0.11)})`;
  });

  const eyebrow = count ? `${count} songs` : "Your playlist";

  if (variant === "editorial") {
    return (
      <div ref={root} className={cn("will-change-transform", className)} style={{ opacity: 0 }}>
        <span
          ref={rule}
          className="mb-5 block h-px w-24 origin-left bg-linear-to-r from-ember via-band-mids to-band-air"
        />
        <p className="font-mono text-[10px] tracking-[0.34em] text-ink-faint uppercase">{eyebrow}</p>
        <p className="mt-3 font-display text-[clamp(2rem,4.4vw,3.4rem)] leading-[0.98] text-ink">
          Listening to
          <br />
          your <em className="text-ember-soft">music</em>
        </p>
      </div>
    );
  }

  if (variant === "wide") {
    return (
      <div ref={root} className={cn("text-center will-change-transform", className)} style={{ opacity: 0 }}>
        <p className="font-mono text-[11px] leading-[2.2] tracking-[0.62em] text-ink uppercase">
          Listening to your music
        </p>
        <span
          ref={rule}
          className="mx-auto mt-4 block h-px w-40 origin-center bg-linear-to-r from-transparent via-ink-faint to-transparent"
        />
      </div>
    );
  }

  if (variant === "lower") {
    return (
      <div className={cn("flex items-end gap-5", className)}>
        <div ref={root} className="will-change-transform" style={{ opacity: 0 }}>
          <p className="font-mono text-[10px] tracking-[0.34em] text-ink-faint uppercase">{eyebrow}</p>
          <p className="mt-2 font-display text-[clamp(1.9rem,3.6vw,2.9rem)] leading-tight text-ink">
            Listening to your <em className="text-ember-soft">music</em>
          </p>
        </div>
      </div>
    );
  }

  if (variant === "tight") {
    return (
      <div ref={root} className={cn("text-center will-change-transform", className)} style={{ opacity: 0 }}>
        <p className="font-display text-[clamp(1.7rem,3.2vw,2.5rem)] leading-none tracking-[-0.02em] text-ink">
          Listening to your music
        </p>
        <p className="mt-3 font-mono text-[10px] tracking-[0.3em] text-ink-faint uppercase">
          {count ? `${count} songs · measuring` : "Measuring"}
        </p>
      </div>
    );
  }

  return (
    <div ref={root} className={cn("text-center will-change-transform", className)} style={{ opacity: 0 }}>
      <p className="font-display text-[clamp(2rem,4vw,3.1rem)] leading-tight text-ink">
        Listening to your <em className="text-ember-soft">music</em>
      </p>
      <span
        ref={rule}
        className="mx-auto mt-5 block h-px w-28 origin-center bg-linear-to-r from-transparent via-ember to-transparent"
      />
    </div>
  );
}
