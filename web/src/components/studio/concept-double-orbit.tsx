"use client";

import { useRef } from "react";
import { ARTWORK, SPECTRAL_STOPS, rand } from "./material";
import { Cover, Headphones, Listening, useFrame } from "./primitives";
import { clamp, easeInExpo, easeOutExpo, lerp, span, type Sequence } from "./sequence";

/**
 * 01 — DOUBLE ORBIT
 *
 * The intended direction, built as described: one playlist at the centre, the
 * original ring around it, and a second ring outside that is a true duplicate —
 * same treatment, same orbital motion, same easing — not a decorative outline.
 *
 * The outer ring is what leaves. It widens, thins and releases while the inner
 * ring keeps its original behaviour, so the composition reads as one object
 * breathing out rather than two unrelated circles.
 */

const COUNT = 7;
const TAU = Math.PI * 2;

type Ring = {
  count: number;
  radius: number; // of the stage's shorter side
  size: number; // tile edge, as a fraction of the shorter side
  speed: number; // turns across the whole sequence
  phase: number;
  offset: number; // index into the artwork, so the rings never repeat each other
};

const INNER: Ring = { count: COUNT, radius: 0.215, size: 0.088, speed: 0.62, phase: -0.25, offset: 1 };
const OUTER: Ring = { count: COUNT, radius: 0.345, size: 0.072, speed: 0.46, phase: 0.06, offset: 8 };

export function DoubleOrbit({ seq }: { seq: Sequence }) {
  const stage = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const innerTiles = useRef<(HTMLDivElement | null)[]>([]);
  const outerTiles = useRef<(HTMLDivElement | null)[]>([]);
  const rings = useRef<HTMLDivElement>(null);
  const innerRing = useRef<SVGGElement>(null);
  const outerRing = useRef<SVGGElement>(null);

  useFrame(seq, (t) => {
    const box = stage.current;
    if (!box) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    const unit = Math.min(w, h);

    // The rings live in a square box sized to the shorter side, so a viewBox
    // unit is exactly one percent of the same measure the tiles are placed by.
    // Stretching the box to the stage instead would put the paths and the covers
    // on different circles.
    if (rings.current) {
      rings.current.style.width = `${unit}px`;
      rings.current.style.height = `${unit}px`;
    }

    const arrive = span(t, 0.02, 0.2);
    const gone = span(t, 0.64, 0.78); // the inner ring draws in for the handoff
    // The outer ring's whole life: it comes in behind the inner one, holds, then
    // expands away. Easing it out rather than fading flat keeps it physical.
    const outerIn = span(t, 0.08, 0.3);
    const outerLeave = span(t, 0.44, 0.72);

    // Centre
    if (hero.current) {
      const s = lerp(0.72, 1, easeOutExpo(arrive)) * (1 - 0.34 * easeInExpo(span(t, 0.6, 0.78)));
      hero.current.style.opacity = String(arrive * (1 - span(t, 0.62, 0.74)));
      hero.current.style.transform = `translate3d(-50%,-50%,0) scale(${s})`;
      hero.current.style.width = `${unit * 0.17}px`;
      hero.current.style.height = `${unit * 0.17}px`;
    }

    const place = (
      nodes: (HTMLDivElement | null)[],
      ring: Ring,
      enter: number,
      radiusScale: number,
      fade: number,
    ) => {
      const edge = unit * ring.size;
      for (let i = 0; i < ring.count; i += 1) {
        const node = nodes[i];
        if (!node) continue;
        const stagger = clamp((enter - (i / ring.count) * 0.45) / 0.55);
        const eased = easeOutExpo(stagger);
        const angle = (i / ring.count + ring.phase + t * ring.speed) * TAU;
        const r = unit * ring.radius * radiusScale * lerp(1.35, 1, eased);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r * 0.84;
        // Nearer the viewer at the bottom of the ring: a small, honest depth cue.
        const depth = 0.9 + 0.14 * Math.sin(angle);
        node.style.width = `${edge}px`;
        node.style.height = `${edge}px`;
        node.style.opacity = String(eased * fade * (0.62 + 0.38 * depth));
        node.style.transform = `translate3d(${x - edge / 2}px, ${y - edge / 2}px, 0) scale(${depth})`;
      }
    };

    place(innerTiles.current, INNER, arrive, 1 - 0.72 * easeInExpo(gone), 1 - gone);
    place(outerTiles.current, OUTER, outerIn, 1 + 1.15 * easeOutExpo(outerLeave), 1 - outerLeave);

    const ringStyle = (node: SVGGElement | null, scale: number, opacity: number) => {
      if (!node) return;
      node.style.transform = `scale(${scale})`;
      node.style.transformOrigin = "50% 50%";
      node.style.opacity = String(opacity);
    };
    ringStyle(innerRing.current, 1 - 0.72 * easeInExpo(gone), arrive * (1 - gone) * 0.95);
    ringStyle(outerRing.current, 1 + 1.15 * easeOutExpo(outerLeave), outerIn * (1 - outerLeave) * 0.85);
  });

  return (
    <div ref={stage} className="absolute inset-0 overflow-hidden">
      {/* The two paths, drawn in the same hand. */}
      <div
        ref={rings}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <svg viewBox="0 0 100 100" className="size-full overflow-visible" fill="none">
          <defs>
            <linearGradient id="orbit-ramp" x1="8" y1="92" x2="92" y2="8" gradientUnits="userSpaceOnUse">
              {SPECTRAL_STOPS.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          <g ref={outerRing} opacity="0">
            <ellipse
              cx="50"
              cy="50"
              rx="34.5"
              ry="28.98"
              stroke="url(#orbit-ramp)"
              strokeWidth="1.3"
              vectorEffect="non-scaling-stroke"
            />
            <ellipse
              cx="50"
              cy="50"
              rx="31.5"
              ry="26.46"
              stroke="url(#orbit-ramp)"
              strokeWidth="0.8"
              strokeDasharray="1 4"
              vectorEffect="non-scaling-stroke"
              opacity="0.55"
            />
          </g>
          <g ref={innerRing} opacity="0">
            <ellipse
              cx="50"
              cy="50"
              rx="21.5"
              ry="18.06"
              stroke="url(#orbit-ramp)"
              strokeWidth="1.3"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
      </div>

      {/* Both rings live in one centred plane, so they share a centre exactly. */}
      <div className="absolute top-1/2 left-1/2 size-0">
        {Array.from({ length: OUTER.count }, (_, i) => (
          <div
            key={`o${i}`}
            ref={(el) => {
              outerTiles.current[i] = el;
            }}
            className="absolute will-change-transform"
            style={{ opacity: 0 }}
          >
            <Cover
              art={ARTWORK[(i + OUTER.offset) % ARTWORK.length]}
              className="size-full rounded-[18%] ring-1 ring-white/10"
              style={{ boxShadow: "0 12px 40px -16px rgb(0 0 0 / 0.9)" }}
            />
          </div>
        ))}
        {Array.from({ length: INNER.count }, (_, i) => (
          <div
            key={`i${i}`}
            ref={(el) => {
              innerTiles.current[i] = el;
            }}
            className="absolute will-change-transform"
            style={{ opacity: 0 }}
          >
            <Cover
              art={ARTWORK[(i + INNER.offset) % ARTWORK.length]}
              className="size-full rounded-[18%] ring-1 ring-white/12"
              style={{
                boxShadow: `0 16px 44px -18px rgb(0 0 0 / 0.95)`,
                filter: `saturate(${0.9 + rand(i) * 0.2})`,
              }}
            />
          </div>
        ))}
        <div ref={hero} className="absolute will-change-transform" style={{ opacity: 0 }}>
          <Cover
            art={ARTWORK[0]}
            className="size-full rounded-[14%] ring-1 ring-white/15"
            style={{ boxShadow: "0 30px 80px -24px rgb(0 0 0 / 1)" }}
          />
        </div>
      </div>

      <Headphones
        seq={seq}
        variant="trace"
        from={0.68}
        to={0.86}
        className="absolute top-[41%] left-1/2 w-[min(46%,19rem)] -translate-x-1/2 -translate-y-1/2"
      />
      <Listening seq={seq} variant="centred" from={0.84} className="absolute inset-x-0 bottom-[18%] px-8" />
    </div>
  );
}
