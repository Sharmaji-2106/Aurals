"use client";

import { SelectionRail, type RailEntry } from "@/components/selection/rail";
import { useEffect, useRef, useState } from "react";

/**
 * The draw, with its own clock.
 *
 * The discovery sequence runs on a 120 ms interval, which is exactly right for
 * what it was built to do: decide which act is on screen and read numbers out of
 * event payloads as they arrive. It is hopeless for driving an animation —
 * eight updates a second — and the rail inherited it when it moved into the
 * product, so a sequence that ran at sixty frames in its own studio crawled on
 * `/match`.
 *
 * So the rail gets a real clock here, and it lives in its own component for a
 * second reason: sixty renders a second of the whole overlay would re-run the
 * act list, the research feed and every event payload alongside it. Isolated,
 * the only thing that re-renders at frame rate is the thing that is moving.
 */
export function RailAct({ entries }: { entries: readonly RailEntry[] }) {
  const [time, setTime] = useState(0);
  const started = useRef<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      if (started.current === null) started.current = now;
      // A hidden tab stops advancing rather than banking the time, so coming
      // back to it resumes the sequence instead of finding it over.
      if (document.visibilityState !== "hidden") {
        setTime((now - started.current) / 1000);
      } else {
        started.current = now - time * 1000;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Started once, when the draw begins. `time` is read inside the callback
    // only to re-base after a hidden tab, and re-running on it would restart
    // the sequence sixty times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <SelectionRail time={time} entries={entries} />;
}
