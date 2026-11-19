"use client";

import { CandidateField, type Candidate } from "@/components/discovery/scene/candidate-field";
import { quality } from "@/lib/grain/gl";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";

/**
 * The catalogue, as a space the camera moves through.
 *
 * What is honest here and what is not, stated plainly. The number of points is
 * the real count of measured earphones from the `catalogue_loaded` event. The
 * heights are real predicted scores, for the earphones that have one. The
 * remaining points carry no score and sit at the baseline — they are not given
 * invented numbers, and they are never labelled, because the sequence does not
 * know which earphone each one is. Their positions come from an index, which is
 * a seed for a seat in the field, not a claim about a product.
 *
 * Rendering is adaptive by default: the whole module is loaded on demand, and
 * the caller does not mount it at all on a weak device or under reduced
 * motion.
 */

export default function FieldScene({
  /** Real count of measured earphones, from the event. */
  measured,
  /** The ranked earphones, which are the ones with scores. */
  scored,
  /** 0 while the field is open, 1 once the ranking has settled. */
  settled,
}: {
  measured: number;
  scored: { slug: string; mean: number }[];
  settled: number;
}) {
  const candidates = useMemo<Candidate[]>(() => {
    const byIndex: Candidate[] = [];
    for (let i = 0; i < Math.max(1, measured); i += 1) {
      const ranked = scored[i];
      byIndex.push(
        ranked
          ? { slug: ranked.slug, score: ranked.mean }
          : // No score, no identity, no claim — a seat in the field.
            { slug: `seat-${i}`, score: null },
      );
    }
    return byIndex;
  }, [measured, scored]);

  const tier = quality();

  return (
    <Canvas
      // The scene is a backdrop; it must never intercept a click meant for the
      // copy or the skip control in front of it.
      className="pointer-events-none"
      dpr={tier === "high" ? [1, 2] : 1}
      gl={{ antialias: tier === "high", alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 2.6, 7.4], fov: 42 }}
    >
      <ambientLight intensity={0.35} />
      {/* Light from above, as everything else in this product is lit. */}
      <directionalLight position={[2, 6, 3]} intensity={1.5} color="#ffd9c2" />
      <directionalLight position={[-4, 1, -2]} intensity={0.5} color="#7fa6f4" />
      <CandidateField candidates={candidates} settled={settled} />
    </Canvas>
  );
}
