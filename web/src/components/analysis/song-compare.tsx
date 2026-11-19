"use client";

import { SignatureStage, StageLine, StageReference } from "@/components/signature/stage";
import type { SubmissionTrack } from "@/lib/api/client";
import { AnimatePresence, motion } from "motion/react";

/** One song against the listening signature, next to the song list. */
export function SongCompare({
  freqs,
  median,
  track,
}: {
  freqs: number[];
  median: number[];
  track: SubmissionTrack | null;
}) {
  return (
    <div>
      <div className="flex min-h-10 items-start justify-between gap-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={track?.id ?? "none"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="min-w-0"
          >
            <p className="truncate font-display text-[1.5rem] leading-tight text-ink">
              {track?.title ?? "Your signature"}
            </p>
            <p className="truncate text-[12px] text-ink-faint">
              {track ? "against your signature" : "Hover a song to compare it"}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
      <SignatureStage height={150} domain={[-32, 14]} label="A song compared with the listening signature">
        <StageReference value={0} />
        <StageLine series={{ freqs, values: median }} variant={track ? "ghost" : "primary"} glow={!track} />
        {track?.spectrum && (
          <StageLine series={{ freqs, values: track.spectrum }} variant="white" glow={false} width={1.75} />
        )}
      </SignatureStage>
    </div>
  );
}
