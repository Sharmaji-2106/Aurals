"use client";

import type { SubmissionTrack } from "@/lib/api/client";
import { BAND_COLOR, BANDS } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { reasonLabel } from "@/lib/reasons";
import { useElementSize } from "@/lib/use-element-size";
import { thumbnailUrl } from "@/lib/youtube";
import { Music2 } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

/** Beyond this the row reads as clutter rather than as a count; the rest become "+N". */
const MAX_DISCS = 4;
const CHIP_WIDTH = 34; // room the "+N" chip needs when not every song fits
const TAIL = 20; // the part of the last record that no neighbour overlaps
const TURN_SECONDS = 3.6; // slower than a real 33 rpm record: legible at this size
const TICK_MS = 300;
const HOLD_TICKS = 4; // ~1.2s: long enough for a finished record to play its outcome

type DiscState = "queued" | "spinning" | "done" | "failed";

const spinningIds = (tracks: SubmissionTrack[]) =>
  new Set(tracks.filter((t) => t.status === "analyzing").map((t) => t.id));

/** Stable per-song variation, so a record keeps its accent and speed across polls. */
function hash(id: string) {
  let value = 0;
  for (let i = 0; i < id.length; i++) value = (value * 31 + id.charCodeAt(i)) >>> 0;
  return value;
}

/**
 * The songs the workers are measuring right now, as spinning records.
 *
 * Driven entirely by the pipeline's own track statuses, never by a timer: `analyzing`
 * is set when a worker picks a track up and cleared when it finishes, so one turning
 * disc is one busy worker. A record that has just finished holds its place for a
 * moment to play its outcome — a completion pass, or a broken ring with the real
 * reason — and when fewer songs are in hand than the row can hold, the ones waiting
 * their turn sit behind them, still. Any that do not fit are counted in a chip, never
 * dropped, and the count in the label is always the true one.
 */
export function SpinningRecords({ tracks, className }: { tracks: SubmissionTrack[]; className?: string }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [capacity, setCapacity] = useState(MAX_DISCS);
  const [hovered, setHovered] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ id: string; ttl: number }[]>([]);
  const [seen, setSeen] = useState(() => ({ tracks, spinning: spinningIds(tracks) }));

  // Which records finished since the last poll: they keep their slot for a beat so the
  // outcome is visible, instead of blinking out the instant the status changes. This is
  // the "adjust state when a prop changes" pattern, compared during render so the row
  // never paints a frame with the record already gone.
  if (seen.tracks !== tracks) {
    const finished = tracks.filter(
      (t) => seen.spinning.has(t.id) && (t.status === "done" || t.status === "failed"),
    );
    setSeen({ tracks, spinning: spinningIds(tracks) });
    if (finished.length) {
      setRecent((held) => [
        ...held.filter((h) => !finished.some((f) => f.id === h.id)),
        ...finished.map((t) => ({ id: t.id, ttl: HOLD_TICKS })),
      ]);
    }
  }

  // Held records age out on a counter rather than a clock, so the row stays a pure
  // function of its state.
  useEffect(() => {
    if (!recent.length) return;
    const tick = setInterval(
      () => setRecent((held) => held.map((h) => ({ ...h, ttl: h.ttl - 1 })).filter((h) => h.ttl > 0)),
      TICK_MS,
    );
    return () => clearInterval(tick);
  }, [recent.length]);

  // How many discs the row can hold, from its measured width alone: the counter beside
  // it changes width as the numbers change, and the discs must not twitch along with it.
  useEffect(() => {
    const el = ref.current;
    if (!el || !width) return;
    const pitch = Number.parseFloat(getComputedStyle(el).getPropertyValue("--disc-pitch")) || 48;
    const fits = Math.max(1, Math.min(MAX_DISCS, Math.floor((width - CHIP_WIDTH - TAIL) / pitch)));
    if (fits < capacity) {
      setCapacity(fits); // narrower: give the space back at once, never overflow
      return;
    }
    if (fits > capacity) {
      const settled = setTimeout(() => setCapacity(fits), 500);
      return () => clearTimeout(settled);
    }
  }, [ref, width, capacity]);

  const spinningCount = tracks.reduce((n, t) => n + (t.status === "analyzing" ? 1 : 0), 0);

  // Built in the submission's own order, so a record that finishes plays its outcome
  // where it stood rather than jumping to the end of the row.
  const shown = useMemo(() => {
    const held = new Set(recent.map((h) => h.id));
    const active = tracks.filter((t) => t.status === "analyzing" || held.has(t.id)).slice(0, capacity);
    if (active.length >= capacity) return active;
    // Room to spare: show what is waiting its turn, recessed and still.
    const waiting = tracks.filter((t) => t.status === "queued").slice(0, capacity - active.length);
    return [...active, ...waiting];
  }, [tracks, recent, capacity]);

  const overflow = spinningCount - shown.reduce((n, t) => n + (t.status === "analyzing" ? 1 : 0), 0);
  // A song can finish while the pointer is on it; then nothing is hovered any more.
  const lifted = shown.some((t) => t.id === hovered) ? hovered : null;
  // Layout animation only when the row itself changes: which records, in what order.
  // Without this, every poll re-measured each record, and any reflow elsewhere on the
  // page (a new title, the count growing a digit) slid them down and back up again.
  const order = `${shown.map((t) => t.id).join("|")}#${overflow}`;

  return (
    <div
      ref={ref}
      className={cn(
        // Fills the space between the heading and the counter on wide screens; on a
        // phone it is a full-width row that takes no height until a song is in hand.
        // The records sit in a shallow stack, each overlapping the one before it.
        "flex w-full items-center -space-x-3 sm:-space-x-3.5 md:min-h-16 md:w-auto md:flex-1 md:justify-center md:-space-x-4",
        // A record on its way out is taken out of the flow and animates from where it
        // stood, which on a narrow screen can reach past the edge: clip that axis there.
        "overflow-x-clip",
        shown.length ? "min-h-16" : "min-h-0",
        // How far each record advances past the previous one (its width less the overlap).
        "[--disc-pitch:36px] sm:[--disc-pitch:42px] md:[--disc-pitch:48px]",
        className,
      )}
      aria-label={spinningCount ? `${plural(spinningCount, "song")} being measured` : undefined}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {shown.map((track) => (
          <Record
            key={track.id}
            track={track}
            state={
              track.status === "analyzing"
                ? "spinning"
                : track.status === "queued"
                  ? "queued"
                  : track.status === "done"
                    ? "done"
                    : "failed"
            }
            raised={lifted === track.id}
            dimmed={lifted !== null && lifted !== track.id}
            onHover={setHovered}
            order={order}
          />
        ))}
        {overflow > 0 && (
          <motion.span
            key="overflow"
            layout="position"
            layoutDependency={order}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="numeric shrink-0 pl-5 text-[12px] text-ink-faint"
          >
            +{overflow}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

const SR_LABEL: Record<DiscState, string> = {
  queued: "Waiting to be measured",
  spinning: "Measuring",
  done: "Measured",
  failed: "Couldn't be measured",
};

function Record({
  track,
  state,
  raised,
  dimmed,
  onHover,
  order,
}: {
  track: SubmissionTrack;
  state: DiscState;
  raised: boolean;
  dimmed: boolean;
  onHover: (id: string | null) => void;
  /** Changes only when the row's records change; layout is animated only then. */
  order: string;
}) {
  const reduced = useReducedMotion();
  const isPresent = useIsPresent();
  const rotate = useMotionValue(0);
  const [broken, setBroken] = useState(false);
  const seed = hash(track.id);
  const accent = BAND_COLOR[BANDS[seed % BANDS.length].key];
  const duration = TURN_SECONDS * (0.9 + ((seed >> 3) % 5) / 20); // 3.2-3.9s per turn
  const turning = state === "spinning";

  useEffect(() => {
    if (reduced) return;
    if (isPresent && turning) {
      const spin = animate(rotate, 360, { duration, ease: "linear", repeat: Infinity, repeatType: "loop" });
      return () => spin.stop();
    }
    if (state === "queued") return; // never started; it should not drift
    // Finished or leaving: let the platter coast to a stop rather than cutting it.
    const settle = animate(rotate, rotate.get() + 26, { duration: 0.7, ease: [0.16, 1, 0.3, 1] });
    return () => settle.stop();
  }, [isPresent, turning, state, reduced, rotate, duration]);

  const ring =
    state === "failed"
      ? `0 0 0 2px rgb(8 8 10 / 0.95), 0 6px 18px rgb(0 0 0 / 0.55)`
      : state === "done"
        ? `0 0 0 2px rgb(8 8 10 / 0.95), 0 6px 18px rgb(0 0 0 / 0.55), 0 0 0 3px ${accent}66`
        : state === "queued"
          ? `0 0 0 2px rgb(8 8 10 / 0.95), 0 4px 12px rgb(0 0 0 / 0.45)`
          : `0 0 0 2px rgb(8 8 10 / 0.95), 0 6px 18px rgb(0 0 0 / 0.55), 0 0 0 3px ${accent}18`;

  return (
    <motion.div
      layout="position"
      layoutDependency={order}
      initial={{ opacity: 0, scale: 0.82 }}
      // Dimming and the hover lift ride on motion rather than CSS: motion owns
      // `opacity` and `transform` inline, and inline styles win over any class here.
      // The raised record also comes to the front of the stack.
      animate={{
        opacity: dimmed ? 0.4 : state === "queued" ? 0.45 : state === "failed" ? 0.6 : 1,
        scale: raised ? 1.18 : state === "queued" ? 0.88 : 1,
        y: raised ? -5 : 0,
        zIndex: raised ? 20 : 1,
      }}
      exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.45, delay: 0.1 } }}
      transition={{ duration: raised ? 0.32 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      onHoverStart={() => onHover(track.id)}
      onHoverEnd={() => onHover(null)}
      className="group/disc relative shrink-0"
    >
      <span className="sr-only">
        {SR_LABEL[state]} {track.title ?? "a song"}
      </span>

      {/* The platter: grooves and label turn together. */}
      <motion.div style={{ rotate }} className="relative size-12 rounded-full sm:size-14 md:size-16">
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle at 50% 50%, #191a1d 0%, #101013 58%, #08080a 100%)",
            // The outer dark ring keeps overlapping records reading as separate discs.
            boxShadow: `inset 0 0 0 1px rgb(255 255 255 / 0.09), inset 0 0 12px rgb(0 0 0 / 0.9), ${ring}`,
          }}
        />
        {/* Grooves */}
        <span
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            background:
              "repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.05) 0 0.5px, transparent 0.5px 2.5px)",
            maskImage:
              "radial-gradient(circle at 50% 50%, transparent 36%, #000 38%, #000 97%, transparent 98%)",
          }}
        />
        {/* Centre label: artwork, centre-cropped so the picture is never stretched. */}
        {/* 80% of the platter across, leaving a grooved rim around the sleeve art. */}
        <span
          className={cn(
            "absolute overflow-hidden rounded-full bg-elevated ring-1 ring-white/12",
            state === "failed" && "grayscale",
            state === "queued" && "saturate-[0.35]",
          )}
          style={{ inset: "10%" }}
        >
          {broken ? (
            <span className="grid size-full place-items-center" style={{ background: `${accent}22` }}>
              <Music2 className="size-3.5 text-ink-faint" />
            </span>
          ) : (
            <Image
              src={thumbnailUrl(track.video_id)}
              alt=""
              fill
              sizes="96px"
              unoptimized
              className="object-cover"
              onError={() => setBroken(true)}
            />
          )}
        </span>
        {/* Spindle hole */}
        <span className="absolute top-1/2 left-1/2 size-[7%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas ring-1 ring-white/20" />
      </motion.div>

      {/* A measurement landing: one bright pass across the record, then it leaves. */}
      {state === "done" && !reduced && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <motion.span
            className="absolute inset-y-[-40%] w-1/2"
            style={{
              background: `linear-gradient(100deg, transparent, ${accent}, transparent)`,
              filter: "blur(2px)",
            }}
            initial={{ left: "-60%", opacity: 0.9 }}
            animate={{ left: "110%", opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          />
        </span>
      )}

      {/* A measurement that never landed: the ring is broken where it stopped. */}
      {state === "failed" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border border-dashed border-ink-faint/60"
        />
      )}

      {/* Fixed light source: the sheen stays put while the record turns. */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(118deg, transparent 26%, rgb(255 255 255 / 0.13) 43%, rgb(255 255 255 / 0.02) 52%, transparent 66%)",
        }}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-200 group-hover/disc:opacity-100"
        style={{ boxShadow: `0 0 18px ${accent}55, 0 10px 26px rgb(0 0 0 / 0.6)` }}
      />

      {/* Title on hover, absolutely placed so nothing reflows. */}
      <span className="pointer-events-none absolute top-full left-1/2 z-20 mt-2 hidden -translate-x-1/2 flex-col items-center opacity-0 transition-opacity duration-200 group-hover/disc:opacity-100 sm:flex">
        <span className="max-w-44 truncate rounded-full border border-hairline-strong bg-canvas/92 px-2.5 py-1 text-[11px] text-ink backdrop-blur">
          {track.title ?? "Unavailable video"}
        </span>
        <span className="mt-1 max-w-44 truncate text-[10px] text-ink-faint">
          {state === "failed" ? reasonLabel(track.reason) || "Couldn't be measured" : track.channel}
        </span>
      </span>
    </motion.div>
  );
}
