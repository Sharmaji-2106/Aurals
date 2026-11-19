"use client";

import { useRef } from "react";
import { ARTWORK } from "./material";
import { Cover, Headphones, Listening, useFrame } from "./primitives";
import { clamp, easeInExpo, easeOutExpo, lerp, span, type Sequence } from "./sequence";

/**
 * 04 — ARTWORK IN MOTION
 *
 * The covers are the subject. They are placed, not scattered: a composed spread
 * across three depth planes, drifting slowly while a camera eases forward, then
 * drawn together to one point.
 *
 * CSS 3D, because the browser's compositor is already a perspective renderer and
 * real artwork stays sharp in it at any scale.
 */

type Card = { x: number; y: number; z: number; s: number; art: number; tilt: number; label?: boolean };

const CARDS: Card[] = [
  { x: -0.12, y: 0.04, z: 60, s: 0.27, art: 0, tilt: -1.5, label: true },
  { x: 0.31, y: -0.25, z: -110, s: 0.17, art: 1, tilt: 2 },
  { x: -0.34, y: -0.21, z: -230, s: 0.145, art: 2, tilt: -3 },
  { x: 0.345, y: 0.17, z: -55, s: 0.19, art: 3, tilt: 1.5, label: true },
  { x: -0.4, y: 0.25, z: -170, s: 0.13, art: 4, tilt: 2.5 },
  { x: 0.07, y: -0.35, z: -310, s: 0.11, art: 5, tilt: -2 },
  { x: 0.45, y: -0.05, z: -290, s: 0.1, art: 6, tilt: 3 },
  { x: -0.07, y: 0.34, z: -130, s: 0.145, art: 7, tilt: -2.5 },
  { x: -0.45, y: -0.03, z: -80, s: 0.12, art: 8, tilt: 1 },
];

export function ArtworkInMotion({ seq }: { seq: Sequence }) {
  const stage = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);

  useFrame(seq, (t) => {
    const box = stage.current;
    if (!box) return;
    const unit = Math.min(box.clientWidth, box.clientHeight);

    const converge = span(t, 0.44, 0.72);
    const dissolve = span(t, 0.6, 0.78);

    if (plane.current) {
      // The camera eases in across the whole piece, then settles as the covers
      // gather — one continuous move, never a cut.
      const dolly = lerp(-80, 120, easeOutExpo(span(t, 0.02, 0.62))) * (1 - 0.5 * converge);
      const swing = Math.sin(t * 1.9) * 2.2 * (1 - converge);
      plane.current.style.transform = `translate3d(0,0,${dolly}px) rotateY(${swing}deg) rotateX(${swing * -0.35}deg)`;
    }

    CARDS.forEach((card, i) => {
      const node = nodes.current[i];
      if (!node) return;
      const enter = clamp((span(t, 0.01, 0.26) - (i / CARDS.length) * 0.4) / 0.6);
      const eased = easeOutExpo(enter);
      // Each plane drifts at its own rate; the far ones barely move.
      const depthRate = 1 - Math.abs(card.z) / 520;
      const driftX = Math.sin(t * 1.6 + i * 1.31) * unit * 0.018 * depthRate;
      const driftY = Math.cos(t * 1.25 + i * 0.77) * unit * 0.014 * depthRate;

      const x = lerp(card.x, 0, easeInExpo(converge)) * unit + driftX;
      const y = lerp(card.y, 0, easeInExpo(converge)) * unit + driftY;
      const z = lerp(card.z, -520, converge) + lerp(-140, 0, eased);
      const size = unit * card.s;
      const scale = lerp(0.86, 1, eased) * lerp(1, 0.42, converge);
      const tilt = card.tilt * (1 - converge);

      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.style.opacity = String(
        eased * (1 - clamp((dissolve - (CARDS.length - i) * 0.015) / 0.5)) * (1 - 0.1 * converge),
      );
      node.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, ${z}px) rotate(${tilt}deg) scale(${scale})`;
      node.style.filter = `brightness(${0.62 + 0.38 * depthRate}) saturate(${0.82 + 0.18 * depthRate})`;
    });
  });

  return (
    <div ref={stage} className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ perspective: "1400px", perspectiveOrigin: "50% 48%" }}>
        <div
          ref={plane}
          className="absolute top-1/2 left-1/2 size-0 will-change-transform"
          style={{ transformStyle: "preserve-3d" }}
        >
          {CARDS.map((card, i) => (
            <div
              key={card.art}
              ref={(el) => {
                nodes.current[i] = el;
              }}
              className="absolute will-change-transform"
              style={{ opacity: 0 }}
            >
              <Cover
                art={ARTWORK[card.art]}
                className="size-full rounded-[4px] ring-1 ring-white/10"
                style={{ boxShadow: "0 40px 90px -30px rgb(0 0 0 / 1)" }}
              />
              {card.label && (
                <span className="mt-2 block font-mono text-[9px] tracking-[0.22em] text-ink-faint uppercase">
                  {ARTWORK[card.art].artist}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <Headphones
        seq={seq}
        variant="solid"
        from={0.68}
        to={0.88}
        className="absolute top-[38%] left-1/2 w-[min(44%,18rem)] -translate-x-1/2 -translate-y-1/2"
      />
      <Listening
        seq={seq}
        variant="editorial"
        from={0.85}
        count={ARTWORK.length}
        className="absolute bottom-[14%] left-[7%] pr-8"
      />
    </div>
  );
}
