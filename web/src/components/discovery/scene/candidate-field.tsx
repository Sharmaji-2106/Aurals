"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * The measured catalogue, as a field of candidates.
 *
 * One instanced mesh for all 203 earphones, because 203 draw calls to say
 * "we looked at everything" would be a poor trade. Each instance's resting
 * height is its own predicted score, so the field genuinely sorts itself as
 * the engine's numbers arrive — a candidate that rises is a candidate that
 * scored well, not a decorative particle.
 *
 * Nothing here invents a number. Until `scores` carries a value for a slug,
 * that instance sits at the unscored baseline.
 */

export type Candidate = {
  slug: string;
  /** The engine's predicted mean, 0-100, or null before it has been scored. */
  score: number | null;
};

/** A small deterministic PRNG: the same catalogue must always lay out the same. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

type Seat = {
  /** Angle around the field. */
  theta: number;
  /** Distance from the centre. */
  radius: number;
  /** Per-instance drift phase, so the field breathes unevenly. */
  phase: number;
};

export function CandidateField({
  candidates,
  /** 0 while evaluating, 1 once the ranking has settled. */
  settled,
  intensity = 1,
}: {
  candidates: Candidate[];
  settled: number;
  intensity?: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  // Deterministic seats, recomputed only when the catalogue itself changes.
  const seats = useMemo<Seat[]>(
    () =>
      candidates.map((c, i) => {
        const r = hash(c.slug);
        const r2 = hash(`${c.slug}:2`);
        return {
          theta: (i / Math.max(1, candidates.length)) * Math.PI * 2 + r * 0.6,
          radius: 2.2 + r2 * 3.4,
          phase: r * Math.PI * 2,
        };
      }),
    [candidates],
  );

  const scratch = useMemo(() => new THREE.Object3D(), []);
  const colour = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const node = mesh.current;
    if (!node) return;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < seats.length; i += 1) {
      const seat = seats[i];
      const score = candidates[i]?.score;
      // An unscored candidate has no height to claim, so it waits on the floor.
      const lift = score == null ? 0 : ((score - 60) / 40) * 3.2;
      const drift = Math.sin(t * 0.5 + seat.phase) * 0.28 * (1 - settled);

      scratch.position.set(
        Math.cos(seat.theta) * seat.radius,
        lift * settled + drift,
        Math.sin(seat.theta) * seat.radius,
      );
      const scale = 0.045 + (score == null ? 0 : 0.03 * settled);
      scratch.scale.setScalar(scale);
      scratch.updateMatrix();
      node.setMatrixAt(i, scratch.matrix);

      // Warm where the match is strong, cool where it is not — the project's
      // spectral language, driven by the real score.
      const warmth = score == null ? 0.08 : Math.max(0, Math.min(1, (score - 55) / 35));
      colour.setRGB(
        (0.25 + warmth * 0.75) * intensity,
        (0.3 + warmth * 0.35) * intensity,
        (0.55 - warmth * 0.3) * intensity,
      );
      node.setColorAt(i, colour);
    }

    node.instanceMatrix.needsUpdate = true;
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, Math.max(1, candidates.length)]}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial
        roughness={0.35}
        metalness={0.1}
        emissive="#ff5238"
        emissiveIntensity={0.12}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
