"use client";

import type { Engraving } from "@/components/card/artwork";
import type { ArtDirection } from "@/components/card/commission";
import { phases } from "@/components/card/reveal";
import { CardStage } from "@/components/card/scene/card-stage";
import { usePlaybackClock } from "@/lib/playback";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect } from "react";
import * as THREE from "three";

/**
 * The reveal on its own, full screen, with a transport: for watching, scrubbing
 * and capturing it without the rest of the edition.
 */
export function CardStudioStage({ engraving, art }: { engraving: Engraving; art: ArtDirection }) {
  const total = phases().total;
  const playback = usePlaybackClock<"reveal">({
    length: total,
    skipTo: total,
    stages: { reveal: 0 },
    order: ["reveal"],
    autoPlay: false,
  });
  const { play, pause, seek } = playback;
  const ready = useCallback(() => play(), [play]);

  useEffect(() => {
    const host = window as unknown as { __cardSeek?: (s: number) => void };
    host.__cardSeek = (s: number) => {
      pause();
      seek(s);
    };
    return () => {
      delete host.__cardSeek;
    };
  }, [pause, seek]);

  return (
    <div
      className="fixed inset-0 bg-canvas"
      data-time={playback.time.toFixed(3)}
      data-total={total.toFixed(3)}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1.08,
        }}
        camera={{ fov: 22, near: 0.01, far: 5, position: [0, 0, 0.26] }}
      >
        <CardStage
          engraving={engraving}
          art={art}
          time={playback.time}
          interactive={playback.time >= total}
          onReady={ready}
        />
      </Canvas>
      <div className="absolute right-4 bottom-4 flex items-center gap-2 font-mono text-[10px] text-white/60">
        <span>{playback.time.toFixed(2)}s</span>
        <input
          type="range"
          min={0}
          max={total}
          step={0.01}
          value={playback.time}
          onChange={(e) => playback.seek(Number(e.target.value))}
          aria-label="Scrub the reveal"
          className="w-64"
        />
        <button
          type="button"
          onClick={playback.replay}
          className="rounded-full border border-white/20 px-2 py-1"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
