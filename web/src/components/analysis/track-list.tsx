"use client";

import { Spark } from "@/components/signature/spark";
import { EqualizerSpinner } from "@/components/ui/spinner";
import { ArtworkImage } from "@/components/ui/artwork-image";
import type { SubmissionTrack } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { reasonLabel } from "@/lib/reasons";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const ORDER: Record<SubmissionTrack["status"], number> = {
  analyzing: 0,
  done: 1,
  queued: 2,
  failed: 3,
  skipped: 4,
};

/**
 * The songs behind the picture. Each measured song shows its own tiny spectrum, and
 * hovering a row lights its trace on the stage above.
 */
export function TrackList({
  tracks,
  freqs,
  focus,
  onFocus,
}: {
  tracks: SubmissionTrack[];
  freqs: number[] | null;
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const [showSetAside, setShowSetAside] = useState(false);
  const included = tracks.filter((t) => t.status !== "skipped");
  const setAside = tracks.filter((t) => t.status === "skipped");
  const sorted = [...included].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div onPointerLeave={() => onFocus(null)}>
      <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {sorted.map((track) => (
            <motion.li
              key={track.id}
              layout="position"
              className="min-w-0"
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <TrackRow track={track} freqs={freqs} active={focus === track.id} onFocus={onFocus} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {setAside.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowSetAside((v) => !v)}
            className="flex items-center gap-2 text-[13px] text-ink-faint transition-colors hover:text-ink"
            aria-expanded={showSetAside}
          >
            <ChevronDown className={cn("size-4 transition-transform", showSetAside && "rotate-180")} />
            {setAside.length} set aside
          </button>
          <AnimatePresence initial={false}>
            {showSetAside && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="grid grid-cols-1 gap-x-8 overflow-hidden md:grid-cols-2"
              >
                {setAside.map((track) => (
                  <li key={track.id} className="min-w-0">
                    <TrackRow track={track} freqs={freqs} active={false} onFocus={onFocus} />
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function TrackRow({
  track,
  freqs,
  active,
  onFocus,
}: {
  track: SubmissionTrack;
  freqs: number[] | null;
  active: boolean;
  onFocus: (id: string | null) => void;
}) {
  const faded = track.status === "skipped" || track.status === "failed";
  const measured = track.status === "done" && track.spectrum && freqs;
  // A track imported from elsewhere was asked for by one name and measured under
  // another. Both stay on screen; the YouTube title is what was actually analysed.
  const imported = track.imported;
  return (
    <div
      onPointerEnter={() => onFocus(measured ? track.id : null)}
      title={imported && track.title ? `Measured on YouTube as “${track.title}”` : undefined}
      className={cn(
        "flex items-center gap-3.5 border-b border-hairline py-3 transition-[border-color,padding] duration-500 ease-(--ease-out-expo)",
        faded && "opacity-50",
        active && "border-white/30 pl-1.5",
      )}
    >
      <span className="relative size-11 shrink-0 overflow-hidden rounded-md bg-elevated shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
        {track.title && (
          <ArtworkImage
            videoId={track.video_id}
            alt=""
            fill
            sizes="44px"
            className="scale-[1.34] object-cover"
          />
        )}
        {track.status === "analyzing" && (
          <span className="absolute inset-0 grid place-items-center bg-canvas/60 text-ink">
            <EqualizerSpinner label="Measuring" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[14px]", track.status === "queued" ? "text-ink-muted" : "text-ink")}>
          {imported?.title ?? track.title ?? "Unavailable video"}
        </p>
        <p className="truncate text-[12px] text-ink-faint">
          {track.reason
            ? reasonLabel(track.reason)
            : track.status === "queued"
              ? "Waiting"
              : track.status === "analyzing"
                ? "Measuring…"
                : [imported?.artist ?? track.channel, formatDuration(track.duration_s)]
                    .filter(Boolean)
                    .join(" · ")}
        </p>
        {imported && (
          <p className={cn("truncate text-[11px]", imported.confident ? "text-ink-faint" : "text-warn")}>
            From Spotify · {imported.match_note}
          </p>
        )}
      </div>
      {measured ? (
        <Spark freqs={freqs} values={track.spectrum!} active={active} />
      ) : (
        <span className="h-px w-16 shrink-0 bg-white/10" aria-hidden="true" />
      )}
    </div>
  );
}
