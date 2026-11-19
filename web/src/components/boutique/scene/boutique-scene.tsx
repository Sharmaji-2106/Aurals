"use client";

import {
  ESTABLISH,
  MATERIAL,
  MODEL_URL,
  WIDE,
  adapt,
  markFor,
  type BoutiqueProduct,
  type Mark,
} from "@/components/boutique/contract";
import { buildMaterials } from "@/components/boutique/scene/materials";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * The boutique, in the browser.
 *
 * The joinery arrives as geometry from Blender and is re-materialised here by
 * name, because procedural shaders do not survive glTF. The lighting, the
 * camera and every interaction are the browser's own.
 *
 * One rule holds the whole thing together: there is exactly one camera
 * controller, and it is the only thing in the scene that ever writes to the
 * camera. Interaction changes a *goal*; the controller eases toward it. Nothing
 * else moves it, which is why a click during a move cannot leave the camera
 * stranded between two animations.
 */

useGLTF.preload(MODEL_URL);

/* ----------------------------------------------------------------- camera --- */

/** Frame-rate independent damping: the same curve at 30 fps and at 144. */
const approach = (current: number, goal: number, lambda: number, dt: number) =>
  goal + (current - goal) * Math.exp(-lambda * dt);

/** Close enough to stop asking for frames. */
const SETTLED = 0.0015;

export function CameraRig({ mark, onSettled }: { mark: Mark; onSettled?: (settled: boolean) => void }) {
  const target = useRef(new THREE.Vector3(...ESTABLISH.target));
  const settled = useRef(false);
  const { invalidate } = useThree();

  // A new goal always means at least one more frame, even if the scene was
  // idle. Without this the camera would simply never start moving in demand
  // mode.
  useEffect(() => {
    settled.current = false;
    onSettled?.(false);
    invalidate();
  }, [mark, invalidate, onSettled]);

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    // The shot is chosen for the frame it will be seen in, every frame, so a
    // rotation or a resize recomposes rather than crops.
    const shot = adapt(mark, state.size.width / Math.max(1, state.size.height));
    // Clamped, so a long stall (a background tab, a slow first paint) resumes
    // by easing rather than by jumping.
    const dt = Math.min(delta, 0.1);

    camera.position.x = approach(camera.position.x, shot.position[0], 3.1, dt);
    camera.position.y = approach(camera.position.y, shot.position[1], 3.1, dt);
    camera.position.z = approach(camera.position.z, shot.position[2], 3.1, dt);

    target.current.x = approach(target.current.x, shot.target[0], 3.4, dt);
    target.current.y = approach(target.current.y, shot.target[1], 3.4, dt);
    target.current.z = approach(target.current.z, shot.target[2], 3.4, dt);

    const fov = approach(camera.fov, shot.fov, 3.1, dt);
    if (Math.abs(fov - camera.fov) > 0.0005) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(target.current);

    const distance =
      camera.position.distanceTo(new THREE.Vector3(shot.position[0], shot.position[1], shot.position[2])) +
      Math.abs(camera.fov - shot.fov) * 0.01;

    if (distance > SETTLED) {
      invalidate();
      if (settled.current) {
        settled.current = false;
        onSettled?.(false);
      }
    } else if (!settled.current) {
      settled.current = true;
      onSettled?.(true);
    }
  });

  return null;
}

/* --------------------------------------------------------------- lighting --- */

/**
 * The rig, rebuilt from the Blender scene's own arrangement.
 *
 * Cove strips do the atmosphere, a broad key models the wall, a cool fill keeps
 * the shadow side alive, and one slightly warmer source sits over the hero
 * niche. Only the key casts a shadow: seven shadow-casting lights would quadruple
 * the cost of the scene to produce shadows nobody would be able to point to.
 */
export function BoutiqueLighting({
  products,
  quality,
}: {
  products: readonly BoutiqueProduct[];
  quality: "high" | "balanced" | "low";
}) {
  const shadows = quality !== "low";
  return (
    <>
      <ambientLight intensity={0.3} color="#b9c6da" />

      <directionalLight
        position={[-2.6, 3.4, 3.2]}
        intensity={1.75}
        color="#fff4e6"
        castShadow={shadows}
        shadow-mapSize={quality === "high" ? 1024 : 512}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-1}
        shadow-bias={-0.0012}
      />
      <directionalLight position={[3.4, 1.9, 2.6]} intensity={0.5} color="#cfe0f2" />
      <directionalLight position={[0, 0.2, 2.2]} intensity={0.22} color="#f0c79a" />

      {/* One warm source per niche.
          Set forward of the display rather than behind it: a light tucked
          against the back panel is a few centimetres from it, and with
          inverse-square falloff that blows the recess to white while leaving
          the card it was meant to light in its own shadow. */}
      {products.map((p) => (
        <pointLight
          key={p.slug}
          position={[p.anchor[0], p.anchor[1] + (p.hero ? 0.26 : 0.17), p.anchor[2] + 0.26]}
          intensity={p.hero ? 1.25 : 0.72}
          distance={p.hero ? 1.5 : 1.1}
          decay={2}
          color="#f3d6ad"
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ model --- */

export type Picked = { slug: string; point: THREE.Vector3 } | null;

/**
 * The joinery, with its displays made interactive.
 *
 * Each card and its engraved curve get their own material instance. There are
 * seven of them, so the cost is nothing, and it buys the ability to light one
 * display without touching its neighbours — which a shared material cannot do,
 * and which is the whole of the hover behaviour.
 */
export function BoutiqueModel({
  products,
  hovered,
  selected,
  quality,
  onHover,
  onSelect,
}: {
  products: readonly BoutiqueProduct[];
  hovered: string | null;
  selected: string | null;
  quality: "high" | "balanced" | "low";
  onHover: (slug: string | null) => void;
  onSelect: (slug: string) => void;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const { invalidate } = useThree();

  const materials = useMemo(() => buildMaterials(quality), [quality]);

  // One clone per display, so a display can be lit on its own.
  const perCard = useMemo(() => {
    const out = new Map<string, { card: THREE.Material; curve: THREE.Material }>();
    for (const p of products) {
      const card = materials.byName.get(p.hero ? MATERIAL.graphiteHero : MATERIAL.graphite);
      const curve = materials.byName.get(p.hero ? MATERIAL.curveHero : MATERIAL.curve);
      if (!card || !curve) continue;
      out.set(p.slug, { card: card.clone(), curve: curve.clone() });
    }
    return out;
  }, [materials, products]);

  // Blender's scene, re-dressed. Cloning keeps the cached glTF pristine, so a
  // remount does not inherit the last mount's materials.
  const dressed = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = quality !== "low";
      object.receiveShadow = quality !== "low";

      const slug = object.name.startsWith("Card ")
        ? object.name.slice(5)
        : object.name.startsWith("Curve ")
          ? object.name.slice(6)
          : null;
      const own = slug ? perCard.get(slug) : undefined;

      if (own && object.name.startsWith("Card ")) {
        object.material = own.card;
        return;
      }
      if (own && object.name.startsWith("Curve ")) {
        object.material = own.curve;
        return;
      }
      const incoming = Array.isArray(object.material) ? object.material[0] : object.material;
      const replacement = materials.byName.get(incoming?.name ?? "");
      if (replacement) object.material = replacement;
    });
    return root;
  }, [scene, materials, perCard, quality]);

  // Hover and selection are expressed entirely as material state, so nothing
  // moves and nothing is outlined. A display that is being looked at simply
  // has its light turned up.
  useEffect(() => {
    for (const p of products) {
      const own = perCard.get(p.slug);
      if (!own) continue;
      const lit = p.slug === hovered || p.slug === selected;
      const card = own.card as THREE.MeshStandardMaterial;
      const curve = own.curve as THREE.MeshStandardMaterial;
      const base = p.hero ? 0.62 : 0.34;
      curve.emissiveIntensity = lit ? base * 2.1 : base;
      card.emissive.setHex(0xffffff);
      card.emissiveIntensity = lit ? 0.035 : 0;
    }
    invalidate();
  }, [hovered, selected, perCard, products, invalidate]);

  useEffect(() => {
    return () => {
      for (const own of perCard.values()) {
        own.card.dispose();
        own.curve.dispose();
      }
      materials.dispose();
      dressed.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    };
  }, [materials, perCard, dressed]);

  return (
    <group>
      <primitive object={dressed} />

      {/* The hit targets.
          Raycasting the cards themselves would make a 9 mm sliver of card the
          only clickable thing in a niche. These are invisible panels in front
          of each display, generous enough to be easy to point at and small
          enough never to overlap a neighbour. */}
      {products.map((p) => (
        <mesh
          key={p.slug}
          position={[p.anchor[0], p.anchor[1] + 0.05, p.anchor[2] + 0.06]}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(p.slug);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            onHover(null);
            document.body.style.cursor = "";
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(p.slug);
          }}
        >
          <planeGeometry args={[p.hero ? 0.3 : 0.24, p.hero ? 0.22 : 0.17]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}

      {/* A floor, so the wall stands on something and its plinth casts. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1.6]} receiveShadow={quality !== "low"}>
        <planeGeometry args={[14, 9]} />
        <meshStandardMaterial color="#090a0d" roughness={0.62} metalness={0} />
      </mesh>
    </group>
  );
}

export { markFor, ESTABLISH, WIDE };
