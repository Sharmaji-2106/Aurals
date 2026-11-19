"use client";

import { Controls } from "@/components/final-draw/controls";
import { poseAt } from "@/components/final-draw/choreography";
import { CARDS, STAGE_LABEL } from "@/components/final-draw/contract";
import {
  DEMO_MEASURED_COUNT,
  DEMO_RESPONSE_CREDIT,
  DEMO_RESPONSE_PATH,
  DEMO_WINNER,
} from "@/components/final-draw/demo-data";
import { FinalDraw } from "@/components/final-draw/final-draw";
import { ResponseCurve } from "@/components/final-draw/response-curve";
import { usePlayback } from "@/components/final-draw/use-playback";
import { useEffect, useState } from "react";

/**
 * The Final Draw studio.
 *
 * An isolated route, so the sequence can be watched, scrubbed and measured
 * without going through onboarding, a questionnaire and a music analysis first.
 * It is a development surface: the recommendation on the card is a captured
 * snapshot of a real engine run, labelled as such here and on the card itself.
 */
export default function FinalDrawStudioPage() {
  const playback = usePlayback({ autoPlay: true });
  const [showDebug, setShowDebug] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Respect the reduced-motion preference, and keep respecting it if it changes
  // while the page is open.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // A handle for the capture harness. The scene is a pure function of its
  // clock, so parking it at an instant renders exactly what plays at that
  // instant — which is what makes screenshot review of the choreography
  // meaningful. It depends only on the stable callbacks, so it is installed
  // once rather than reinstalled on every frame; the current time is published
  // on the DOM instead, where it updates with the render that changed it.
  const { pause, seek } = playback;
  useEffect(() => {
    const host = window as unknown as { __finalDrawSeek?: (seconds: number) => void };
    host.__finalDrawSeek = (seconds: number) => {
      pause();
      seek(seconds);
    };
    return () => {
      delete host.__finalDrawSeek;
    };
  }, [pause, seek]);

  const hero = poseAt(playback.time, CARDS[CARDS.length - 1]);

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-[#08090C]"
      data-stage={playback.stage}
      data-time={playback.time.toFixed(3)}
    >
      <FinalDraw
        time={playback.time}
        winner={DEMO_WINNER}
        // The studio has no live recommendation to hand the card, so it shows
        // the earphone's own measured response — real data from the catalogue,
        // credited — rather than an empty well.
        art={
          <ResponseCurve
            path={DEMO_RESPONSE_PATH}
            credit={DEMO_RESPONSE_CREDIT}
            className="absolute inset-0"
          />
        }
        still={reduced}
        className="absolute inset-0"
      />

      {/* Identity, and an unambiguous statement of what this page is. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-6 sm:p-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ink-faint uppercase">AURALS</p>
          <h1 className="display mt-1.5 text-[20px] leading-none tracking-[-0.02em] text-ink">
            The Final Draw
          </h1>
          <p className="numeric mt-2 text-[10.5px] text-ink-faint">
            {DEMO_MEASURED_COUNT} measured earphones &middot; one recommendation
          </p>
        </div>
        <div className="text-right">
          <p className="rounded-full border border-ember/35 bg-ember/10 px-2.5 py-1 font-mono text-[9.5px] tracking-[0.22em] text-ember uppercase">
            Development demo
          </p>
          {reduced && (
            <p className="mt-2 font-mono text-[9px] tracking-[0.18em] text-ink-faint uppercase">
              Reduced motion &middot; still
            </p>
          )}
        </div>
      </div>

      {/* Debug. Hidden unless asked for, so it never appears over playback. */}
      {showDebug && (
        <div className="pointer-events-none absolute top-28 left-6 z-20 rounded-xl border border-hairline bg-black/70 p-3 font-mono text-[10px] leading-relaxed text-ink-muted backdrop-blur-sm sm:left-8">
          <p className="text-ember">{STAGE_LABEL[playback.stage]}</p>
          <p>t {playback.time.toFixed(3)}s</p>
          <p>
            hero x {hero.x.toFixed(1)} y {hero.y.toFixed(1)} z {hero.z.toFixed(1)}
          </p>
          <p>
            spin {hero.spin.toFixed(2)}&deg; upright {hero.upright.toFixed(3)} flip {hero.flip.toFixed(1)}
            &deg;
          </p>
          <p>
            screen {hero.screen.x.toFixed(0)} {hero.screen.y.toFixed(0)} {hero.screen.z.toFixed(0)}
          </p>
          <p className="mt-1.5 text-ink-faint">
            {CARDS.filter((c) => poseAt(playback.time, c).visible).length} / {CARDS.length} on stage
          </p>
        </div>
      )}

      {!reduced && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 sm:p-6">
          <Controls
            playback={playback}
            showDebug={showDebug}
            onToggleDebug={() => setShowDebug((on) => !on)}
          />
        </div>
      )}
    </main>
  );
}
