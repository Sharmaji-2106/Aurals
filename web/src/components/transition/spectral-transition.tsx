"use client";

import {
  AscentField,
  ascentTiming,
  DIVE_TIMING,
  DiveField,
  NAME_TIMING,
  NameRite,
} from "@/components/transition/journeys";
import { SoundField } from "@/components/viz/sound-field";
import { usePathname, useRouter } from "next/navigation";
import { useMotionValue, type MotionValue } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// The field clears shortly after the next page is ready behind it. It used to
// run 6.8s against a 1.95s handoff, which left nearly five seconds of departure
// over a page that had already arrived.
const DURATION = 2_600;
const HANDOFF = 900;
/**
 * How long the exit will wait for the destination to mount once the field has
 * gone. The overlay holds until the next route is up so the reveal never lands
 * on a blank frame — but it cannot hold forever: on a slow machine a route that
 * is still compiling would otherwise pin the overlay in place indefinitely.
 */
const REVEAL_GRACE = 900;

export type TransitionState =
  "idle" | "awakening" | "approaching" | "spectral_sweep" | "clearing" | "revealing_name" | "complete";

/**
 * How to leave: the landing's sound field (the default), the ascent off the
 * homepage's sea (`from` = how far down the page, 0–1), or the name just given.
 */
export type Departure = { via?: "field" | "ascent" | "name" | "dive"; name?: string; from?: number };

type TransitionContextValue = {
  active: boolean;
  phase: TransitionState;
  begin: (destination: string, how?: Departure) => void;
};

const TransitionContext = createContext<TransitionContextValue | null>(null);

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const stateAt = (progress: number): TransitionState => {
  if (progress < 0.14) return "awakening";
  if (progress < 0.42) return "approaching";
  if (progress < 0.8) return "spectral_sweep";
  return "clearing";
};

function DepartureField({ departure }: { departure: MotionValue<number> }) {
  const veil = useRef<HTMLDivElement>(null);

  // The veil hides the destination while the field travels over it. As the field
  // dissolves, the veil goes with it — otherwise the exit ends on a flat panel of
  // canvas colour with the next page sitting behind it, unseen.
  useEffect(
    () =>
      departure.on("change", (value) => {
        if (!veil.current) return;
        const x = clamp((value - 0.74) / 0.24);
        veil.current.style.opacity = String(1 - x * x * (3 - 2 * x));
      }),
    [departure],
  );

  return (
    <div data-transition-field className="absolute inset-0" aria-hidden="true">
      <div ref={veil} data-transition-veil className="absolute inset-0 bg-canvas" />
      {/* This is the landing page's SoundField, with its own geometry and palette,
          carried across the route instead of a second transition renderer. */}
      <SoundField className="absolute inset-0" depart={departure} interactive={false} />
    </div>
  );
}

function SpectralTransition({
  active,
  phase,
  reduced,
  departure,
  how,
}: {
  active: boolean;
  phase: TransitionState;
  reduced: boolean;
  departure: MotionValue<number>;
  how: Departure;
}) {
  if (!active) return null;
  if (reduced) {
    return (
      <div
        className="fixed inset-0 z-[90] bg-canvas"
        data-spectral-transition
        data-phase={phase}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      data-spectral-transition
      data-phase={phase}
      className="pointer-events-auto fixed inset-0 z-[90] overflow-hidden bg-transparent"
      aria-hidden="true"
    >
      {how.via === "ascent" ? (
        <AscentField departure={departure} from={how.from ?? 0} />
      ) : how.via === "name" ? (
        <NameRite departure={departure} name={how.name ?? ""} />
      ) : how.via === "dive" ? (
        <DiveField departure={departure} />
      ) : (
        <DepartureField departure={departure} />
      )}
    </div>
  );
}

export function SpectralTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const departure = useMotionValue(0);
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<TransitionState>("idle");
  const [how, setHow] = useState<Departure>({});
  const timing = useRef({ duration: DURATION, handoff: HANDOFF });
  const phaseRef = useRef<TransitionState>("idle");
  const destination = useRef<string | null>(null);
  const destinationReady = useRef(false);
  const activeRef = useRef(false);
  const currentPathname = useRef(pathname);

  useEffect(() => {
    currentPathname.current = pathname;
    if (activeRef.current && pathname === destination.current) destinationReady.current = true;
  }, [pathname]);

  const finish = useCallback(() => {
    activeRef.current = false;
    destination.current = null;
    phaseRef.current = "complete";
    setPhase("complete");
    setActive(false);
    document.documentElement.style.overflow = "";
  }, []);

  const handoff = useCallback(() => {
    if (!destination.current || currentPathname.current === destination.current) return;
    router.push(destination.current);
  }, [router]);

  const begin = useCallback(
    (to: string, departureHow: Departure = {}) => {
      if (activeRef.current) return;
      const via = departureHow.via ?? "field";
      timing.current =
        via === "ascent"
          ? ascentTiming(departureHow.from ?? 0)
          : via === "name"
            ? NAME_TIMING
            : via === "dive"
              ? DIVE_TIMING
              : { duration: DURATION, handoff: HANDOFF };
      setHow({ ...departureHow, via });
      activeRef.current = true;
      destination.current = to;
      destinationReady.current = false;
      departure.set(0);
      phaseRef.current = "awakening";
      setPhase("awakening");
      document.documentElement.style.overflow = "hidden";
      setActive(true);

      if (reduced) router.push(to);
    },
    [departure, reduced, router],
  );

  // Reduced motion still uses the real route and the real destination, but keeps
  // the veil until that route has mounted before making the short handoff.
  useEffect(() => {
    if (!active || !reduced || pathname !== destination.current) return;
    const timer = window.setTimeout(finish, 120);
    return () => window.clearTimeout(timer);
  }, [active, finish, pathname, reduced]);

  useEffect(() => {
    if (!active || reduced) return;
    let frame = 0;
    let handedOff = false;
    let finished = false;
    let arrivedAt = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = clamp((now - startedAt) / timing.current.duration);
      // The renderer eases each overlapping phase itself. Keep the shared clock
      // linear so the landing field's geometry and the controller's state boundaries
      // stay in the same musical time.
      departure.set(progress);

      const nextPhase = stateAt(progress);
      if (phaseRef.current !== nextPhase) {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
      }

      if (!handedOff && progress >= timing.current.handoff / timing.current.duration) {
        handedOff = true;
        handoff();
      }

      // SoundField has already rendered the final departure frame at progress 1.
      // Only now may the overlay leave the stack and expose the name page — once
      // that page has mounted, or once the grace period has run out.
      if (progress >= 1 && !finished) {
        if (!arrivedAt) arrivedAt = now;
        if (destinationReady.current || now - arrivedAt >= REVEAL_GRACE) {
          finished = true;
          phaseRef.current = "revealing_name";
          setPhase("revealing_name");
          finish();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, departure, finish, handoff, reduced]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      document.documentElement.style.overflow = "";
    };
  }, []);

  return (
    <TransitionContext.Provider value={{ active, phase, begin }}>
      {children}
      <SpectralTransition active={active} phase={phase} reduced={reduced} departure={departure} how={how} />
    </TransitionContext.Provider>
  );
}

export function useSpectralTransition() {
  const context = useContext(TransitionContext);
  if (!context) throw new Error("useSpectralTransition must be used within SpectralTransitionProvider");
  return context;
}
