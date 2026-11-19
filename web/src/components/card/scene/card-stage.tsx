"use client";

import type { Engraving } from "@/components/card/artwork";
import type { ArtDirection } from "@/components/card/commission";
import { revealAt } from "@/components/card/reveal";
import { CardObject } from "@/components/card/scene/card-object";
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * The card inside its canvas: an object sitting in the page.
 *
 * The canvas is transparent — the page's own background is the card's — and
 * the card is lit like a product on a dark set: a soft key from above left
 * that sweeps across it once the engraving is done, a cool fill, and a studio
 * environment of soft boxes for its shine. No sky, no floor, no haze.
 *
 * Posed from the clock (`time`, seconds into the reveal). Once the reveal is
 * over the card is the viewer's: it floats a little, leans toward the pointer,
 * and turns over when dragged or asked to (`turns`).
 */

function lens(camera: THREE.PerspectiveCamera, fov: number) {
  if (Math.abs(camera.fov - fov) < 1e-4) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

export function CardStage({
  engraving,
  art,
  time,
  interactive,
  turns = 0,
  onReady,
}: {
  engraving: Engraving;
  art: ArtDirection;
  time: number;
  interactive: boolean;
  /** Half-turns the viewer has asked for (the "Turn it over" control). */
  turns?: number;
  onReady?: () => void;
}) {
  const { gl, invalidate } = useThree();
  const card = useMemo(() => new CardObject(engraving, art), [engraving, art]);

  useEffect(() => {
    gl.setClearColor(0x000000, 0);
    onReady?.();
    return () => card.dispose();
  }, [card, gl, onReady]);

  /* ---- the viewer's hand ---- */
  const hand = useRef({
    tilt: new THREE.Vector2(),
    gleam: 1.3,
    drag: 0,
    dragTarget: 0,
    dragging: false,
    lastX: 0,
    clock: 0,
  });
  useEffect(() => {
    hand.current.dragTarget = turns * Math.PI;
    invalidate();
  }, [turns, invalidate]);
  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      hand.current.dragging = true;
      hand.current.lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
      invalidate();
    };
    const move = (e: PointerEvent) => {
      invalidate();
      if (!hand.current.dragging) return;
      hand.current.dragTarget += ((e.clientX - hand.current.lastX) / el.clientWidth) * Math.PI * 1.4;
      hand.current.lastX = e.clientX;
    };
    const up = (e: PointerEvent) => {
      hand.current.dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // Come to rest on whichever face is nearer.
      hand.current.dragTarget = Math.round(hand.current.dragTarget / Math.PI) * Math.PI;
      invalidate();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", up);
    };
  }, [interactive, gl, invalidate]);

  const frameRef = useRef<ReturnType<typeof revealAt> | null>(null);
  useLayoutEffect(() => {
    const frame = revealAt(time);
    frameRef.current = frame;
    card.setPresence(frame.presence);
    card.setReveal(frame.reveal);
    card.setGlow(frame.glow);
    invalidate();
  }, [time, card, invalidate]);

  useFrame((state, delta) => {
    const frame = frameRef.current;
    if (!frame) return;
    const camera = state.camera as THREE.PerspectiveCamera;
    const h = hand.current;
    const k = 1 - Math.exp(-delta * 6);
    const pointer = interactive ? state.pointer : { x: 0, y: 0 };
    h.tilt.x += (pointer.y * 0.14 - h.tilt.x) * k;
    h.tilt.y += (pointer.x * 0.22 - h.tilt.y) * k;
    h.drag += (h.dragTarget - h.drag) * (1 - Math.exp(-delta * 5));
    // Once at rest it floats, slowly, like something held in light.
    if (interactive) h.clock += delta;
    const float = interactive ? Math.sin(h.clock * 0.9) : 0;
    card.root.position.set(0, frame.lift + float * 0.0012, 0);
    card.root.rotation.set(
      frame.lean - h.tilt.x + float * 0.012,
      frame.turn + h.tilt.y + h.drag + Math.sin(h.clock * 0.6) * 0.03 * (interactive ? 1 : 0),
      0,
      "YXZ",
    );
    // Light across the relief: once as the card arrives; at rest it follows
    // the hand, like a coin turned under a lamp.
    if (interactive) {
      h.gleam += (0.5 + pointer.x * 0.55 - pointer.y * 0.25 - h.gleam) * k;
      card.setGleam(h.gleam, 0.45);
    } else card.setGleam(frame.sweep, frame.gleam);
    lens(camera, frame.camera.fov);
    camera.position.set(...frame.camera.position);
    camera.lookAt(...frame.camera.target);
    if (interactive) state.invalidate();
  });

  return (
    <>
      <primitive object={card.root} />
      <directionalLight position={[-0.12, 0.22, 0.32]} intensity={1.8} color="#fff3e6" />
      <directionalLight position={[0.3, -0.1, 0.25]} intensity={0.4} color="#a9b8ff" />
      <directionalLight position={[0.0, 0.1, -0.4]} intensity={0.9} color={art.palette.glow} />
      {/* A studio of large, soft sources: what the satin card reflects, so a
          slow gradient of light moves across it as it turns — never a hard
          rectangle of glare. */}
      <Environment resolution={512} frames={1} background={false}>
        <color attach="background" args={["#07060c"]} />
        <Lightformer form="circle" intensity={1.5} color="#fff6ee" position={[-1.7, 1.1, 1.6]} scale={2.6} />
        <Lightformer
          form="rect"
          intensity={0.8}
          color="#fff4ea"
          position={[0, 2.5, 0.8]}
          scale={[4.4, 1.2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#ffd9c2"
          position={[2.1, 0.2, 1.0]}
          scale={[1.1, 3.4, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.3}
          color={art.palette.glow}
          position={[0.2, -1.9, -0.8]}
          scale={[3.4, 1.1, 1]}
        />
        <Lightformer
          form="ring"
          intensity={0.7}
          color={art.palette.accent}
          position={[2.4, 1.6, -1.6]}
          scale={1.4}
        />
      </Environment>
    </>
  );
}
