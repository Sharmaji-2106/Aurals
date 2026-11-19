"use client";

import {
  finalPrintWidth,
  loadEmbeds,
  printEdition,
  type Embeds,
  type PrintedPages,
} from "@/components/book/assets";
import { handoffAt, lightingAt, spreadLayout } from "@/components/book/choreography";
import { editionPages, type BookFeature } from "@/components/book/edition";
import type { BookRun } from "@/components/book/run";
import type { Landing } from "@/components/book/finale";
import { FinalPage } from "@/components/book/final-page";
import { BookStage } from "@/components/book/scene/book-stage";
import { FINAL_FOV, SKIP_TO, T } from "@/components/book/contract";
import { loadMaps, type Maps, type Quality } from "@/components/book/scene/rig";
import { loadTerrace, type TerraceAssets } from "@/components/book/scene/terrace";
import { quality as detectQuality } from "@/lib/grain/gl";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence, motion } from "motion/react";
import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";

/**
 * The reveal: loading, the 3D book, and the overlay that carries it into the
 * real page underneath.
 *
 * It is driven entirely by `time`. It owns no clock — the caller does — so the
 * studio's transport and a production caller drive it the same way. It owns
 * no interface either: what the film lands on is the caller's real `/match`
 * page, whose position it is told (`landing`).
 *
 * Three paths, all ending on that page:
 * - the film, when WebGL works and motion is welcome;
 * - straight to the page, for `prefers-reduced-motion` (`still`);
 * - straight to the page, with a line saying why, when WebGL is unavailable or
 *   the scene fails.
 */

export const FOV = FINAL_FOV;

type Loaded = {
  embeds: Embeds;
  maps: Maps | null;
  terrace: TerraceAssets | null;
  pages: PrintedPages | null;
};

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * The size of the box the canvas actually fills — not the window's.
 *
 * They differ: this project reserves a stable scrollbar gutter, so the content
 * box is narrower than `innerWidth`. The camera frames the canvas, so the DOM
 * page must be laid out in the same box or the handoff lands a few pixels off.
 */
function useBoxSize() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 1440, height: 900 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, size] as const;
}

export function BookReveal({
  time,
  feature,
  run,
  still,
  landing,
  onReady,
}: {
  time: number;
  feature: BookFeature;
  /** Whose numbers the pages print; the sample listener's when omitted. */
  run?: BookRun;
  /** Reduced motion: no film, the page. */
  still: boolean;
  /** Where the real page's product photograph is, for the pullback. */
  landing: Landing | null;
  onReady: (mode: "film" | "page") => void;
}) {
  const edition = useMemo(() => editionPages(feature, run), [feature, run]);
  const [measure, viewport] = useBoxSize();
  const [tier] = useState<Quality>(() => (typeof window === "undefined" ? "balanced" : detectQuality()));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // If an unknown GPU cannot keep up, resolution is the first thing to give.
  const [degraded, setDegraded] = useState(false);

  // Load once. The final pages are printed for the screen as it is now; a
  // later resize re-frames the camera but does not reprint.
  useEffect(() => {
    let cancelled = false;
    const gl = webglAvailable();
    const film = !still && gl;
    const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));
    (async () => {
      let embeds: Embeds;
      try {
        embeds = await loadEmbeds();
        // The DOM page must have its faces before it is shown, or the handoff
        // swaps a printed page for a fallback font.
        await Promise.all([
          document.fonts.load('400 40px "Aurals Serif"'),
          document.fonts.load('italic 400 40px "Aurals Serif"'),
          document.fonts.load('500 40px "Aurals Sans"'),
          document.fonts.load('400 40px "Aurals Script"'),
        ]);
      } catch (error) {
        if (!cancelled) setFailure(describe(error));
        return;
      }
      if (!film) {
        if (cancelled) return;
        // Reduced motion is a choice and needs no explanation; a missing GPU
        // path is not, and the page should say why the film did not play.
        if (!still && !gl) setFailure("WebGL is not available on this device.");
        setLoaded({ embeds, maps: null, terrace: null, pages: null });
        return;
      }
      try {
        const { pageW } = spreadLayout(window.innerWidth, window.innerHeight);
        // A phone gets the smaller sky: it is out of focus anyway.
        const small = Math.min(window.innerWidth, window.innerHeight) < 600 || detectQuality() === "low";
        const [maps, terrace, pages] = await Promise.all([
          loadMaps(),
          loadTerrace(small),
          printEdition(edition, embeds.texture, finalPrintWidth(pageW, window.devicePixelRatio || 1)),
        ]);
        if (!cancelled) setLoaded({ embeds, maps, terrace, pages });
      } catch (error) {
        // The film could not be prepared; the page can still be shown.
        if (!cancelled) {
          setFailure(describe(error));
          setLoaded({ embeds, maps: null, terrace: null, pages: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [edition, still]);

  const film = Boolean(loaded?.maps && loaded.terrace && loaded.pages) && !failure;

  useEffect(() => {
    if (loaded && !film) onReady("page");
  }, [loaded, film, onReady]);

  const handleReady = useCallback(() => {
    setReady(true);
    onReady("film");
  }, [onReady]);

  const handleSceneError = useCallback(
    () => setFailure("The 3D scene could not be drawn on this device."),
    [],
  );

  const lighting = lightingAt(time);
  const handoff = film ? handoffAt(time) : loaded ? 1 : 0;
  // Opaque while it is the film; clear once the page underneath is the picture.
  const clear = !film ? Boolean(loaded) : time >= T.theme[0];

  return (
    <div
      ref={measure}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: clear ? "transparent" : "#080a1b" }}
      data-ready={ready}
      data-mode={film ? "film" : "page"}
    >
      {film && loaded?.maps && loaded.terrace && loaded.pages && (
        <div className="absolute inset-0" style={{ visibility: handoff >= 1 ? "hidden" : "visible" }}>
          <SceneBoundary onError={handleSceneError}>
            <Canvas
              frameloop="demand"
              dpr={degraded || tier === "low" ? 1 : tier === "balanced" ? [1, 1.5] : [1, 2]}
              shadows="percentage"
              gl={{
                antialias: true,
                powerPreference: "high-performance",
                // Khronos Neutral, not ACES: ACES pushes saturated blues toward
                // purple, which turned navy leather maroon under a warm key.
                toneMapping: THREE.NeutralToneMapping,
                toneMappingExposure: 1.1,
              }}
              camera={{ fov: FOV, near: 0.01, far: 20, position: [-0.34, 0.33, 0.66] }}
              onCreated={({ gl }) => gl.setClearColor("#070a1a")}
              fallback={null}
            >
              <PerformanceMonitor onDecline={() => setDegraded(true)} />
              <BookStage
                time={time}
                maps={loaded.maps}
                terrace={loaded.terrace}
                pages={loaded.pages}
                quality={tier}
                onReady={handleReady}
              />
            </Canvas>
          </SceneBoundary>
          {/* A lens vignette, as a gradient over the canvas rather than a
              post-processing pass: the same look for none of the cost. It lifts
              as the camera reaches the page, so the paper ends unshaded. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: lighting.vignette,
              background:
                "radial-gradient(ellipse 75% 70% at 50% 46%, transparent 45%, rgb(4 5 14 / 0.42) 78%, rgb(4 5 14 / 0.78) 100%)",
            }}
          />
        </div>
      )}

      {loaded && (
        <FinalPage
          // Without the film there is only the landed page.
          time={film ? time : SKIP_TO}
          edition={edition}
          feature={feature}
          resolve={loaded.embeds.dom}
          viewport={viewport}
          landing={landing}
        />
      )}

      <AnimatePresence>
        {!ready && !(loaded && !film) && (
          <motion.div
            key="loading"
            className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-[#080a1b]"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="text-center">
              <p
                className="font-book-script text-[44px] leading-none"
                style={{
                  background: "linear-gradient(90deg, #f0a7b8, #ebb09c, #dcb772)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Aurals
              </p>
              <p className="mt-3 font-mono text-[9.5px] tracking-[0.32em] text-[#F1E5D1]/40 uppercase">
                {failure ? "Opening the page instead" : "Preparing the edition"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {failure && loaded && !film && (
        <p className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 font-mono text-[10px] tracking-[0.12em] text-[#F1E5D1]/70">
          The 3D edition could not play here, so the page is shown directly.
        </p>
      )}
    </div>
  );
}
