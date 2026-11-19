"use client";

import type { BoutiqueProduct, Mark } from "@/components/boutique/contract";
import { BoutiqueLighting, BoutiqueModel, CameraRig } from "@/components/boutique/scene/boutique-scene";
import { ESTABLISH } from "@/components/boutique/contract";
import { cn } from "@/lib/cn";
import { quality } from "@/lib/grain/gl";
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo, useState } from "react";
import * as THREE from "three";

/**
 * The canvas, and everything that decides how hard it works.
 *
 * Rendering is on demand. The scene is static joinery, so a frame is only worth
 * drawing when the camera is moving or a display has lit up — and both of those
 * ask for frames explicitly. An idle boutique costs nothing, which is the
 * difference between a page you can leave open and one that drains a battery.
 */

export function Boutique({
  products,
  mark,
  hovered,
  selected,
  onHover,
  onSelect,
  className,
}: {
  products: readonly BoutiqueProduct[];
  mark: Mark;
  hovered: string | null;
  selected: string | null;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string) => void;
  className?: string;
}) {
  const tier = useMemo(() => quality(), []);
  const [settled, setSettled] = useState(false);

  return (
    <div className={cn("absolute inset-0", className)}>
      <Canvas
        frameloop="demand"
        shadows={tier !== "low"}
        dpr={tier === "high" ? [1, 2] : 1}
        gl={{
          antialias: tier !== "low",
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.98,
        }}
        camera={{ position: [...ESTABLISH.position], fov: ESTABLISH.fov, near: 0.1, far: 60 }}
        onCreated={({ gl }) => {
          gl.setClearColor("#08090C");
        }}
      >
        <CameraRig mark={mark} onSettled={setSettled} />
        <BoutiqueLighting products={products} quality={tier} />
        <Suspense fallback={null}>
          <BoutiqueModel
            products={products}
            hovered={hovered}
            selected={selected}
            quality={tier}
            onHover={onHover}
            onSelect={onSelect}
          />
        </Suspense>
        {/* A dark room rather than a void: the wall needs something to sit in,
            and a fog beyond the joinery closes the composition without any
            geometry at all. It starts well past the furthest shot, so backing
            the camera off on a narrow screen never fades the wall out. */}
        <fog attach="fog" args={["#08090C", 7, 26]} />
      </Canvas>

      {/* Announced, not drawn: the camera's state matters to a screen reader
          only in so far as it says what is being looked at. */}
      <span className="sr-only" aria-live="polite">
        {settled ? "The view has settled." : "The view is moving."}
      </span>
    </div>
  );
}
