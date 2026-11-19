"use client";

import type { PrintedPages } from "@/components/book/assets";
import { cameraAt, coverAt, leavesAt, lightingAt } from "@/components/book/choreography";
import { FINAL_FOV } from "@/components/book/contract";
import { BookRig, type Maps, type Quality } from "@/components/book/scene/rig";
import type { TerraceAssets } from "@/components/book/scene/terrace";
import { Environment } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

/**
 * The book inside the canvas.
 *
 * The scene is posed from the clock, not animated by it: whenever `time` or
 * the viewport changes, the whole state for that instant is computed and
 * written, and one frame is requested. With `frameloop="demand"` that means a
 * paused, finished or hidden reveal draws nothing at all.
 */
/** Lens changes go through here: a camera from a hook is not ours to assign to. */
function lens(camera: THREE.PerspectiveCamera, fov: number) {
  if (Math.abs(camera.fov - fov) < 1e-4) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

export function BookStage({
  time,
  maps,
  terrace,
  pages,
  quality,
  onReady,
}: {
  time: number;
  maps: Maps;
  terrace: TerraceAssets;
  pages: PrintedPages;
  quality: Quality;
  onReady: () => void;
}) {
  const { gl, camera, size, scene, invalidate } = useThree();

  const rig = useMemo(
    () => new BookRig(maps, terrace, pages, quality, Math.min(8, gl.capabilities.getMaxAnisotropy())),
    [maps, terrace, pages, quality, gl],
  );

  // Upload every texture before the first frame of the film, so the first
  // page turn is not also the first time the GPU sees that page.
  useEffect(() => {
    rig.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) gl.initTexture(value);
        }
      }
    });
    onReady();
    // Renderer counters for the perf harness and for checking that replays do
    // not accumulate GPU resources.
    const host = window as unknown as { __bookRenderer?: () => Record<string, number> };
    host.__bookRenderer = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
    });
    return () => {
      delete host.__bookRenderer;
      rig.dispose();
    };
  }, [rig, gl, onReady]);

  useLayoutEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const lighting = lightingAt(time);
    rig.pose({ cover: coverAt(time), leaves: leavesAt(time), lighting }, scene);
    const view = cameraAt(time, { width: size.width, height: size.height, fov: FINAL_FOV });
    lens(perspective, view.fov);
    perspective.position.set(...view.position);
    perspective.up.set(...view.up);
    perspective.lookAt(...view.target);
    invalidate();
  }, [time, rig, size, camera, scene, invalidate]);

  return (
    <>
      <primitive object={rig.root} />
      {/* The terrace, as Blender rendered it from where the book lies: what
          the leather's sheen, the foil, the paper and the glass reflect, and
          the ambient light. */}
      <Environment map={terrace.environment} />
      {/* Sea air: enough to sit the villa and the balustrade back, not enough
          to see. The sky is beyond it and draws itself. */}
      <fogExp2 attach="fog" args={["#5b4270", 0.03]} />
    </>
  );
}
