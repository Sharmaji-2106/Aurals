"use client";

import { Spark } from "@/components/signature/spark";
import { Lines, Reveal } from "@/components/site/reveal";
import type { MusicProfile } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { thumbnailUrl } from "@/lib/youtube";
import { motion } from "motion/react";
import { useMemo, useState } from "react";

/**
 * Your music left a fingerprint.
 *
 * The artwork is the real covers of the songs that were actually measured, and
 * what appears beside a cover is that song's own long-term spectrum, as stored
 * on the music profile. Nothing is derived for display.
 *
 * Deliberately absent: genre, mood, "influence scores" and anything about
 * taste. None of that exists in the data, and inventing it would undo the one
 * thing this section is for — showing the profile came from these recordings.
 */

type Tile = {
  id: string;
  title: string | null;
  artist: string | null;
  videoId: string;
  spectrum: number[] | null;
};

const MAX_TILES = 36;

export function Fingerprint({ music, className }: { music: MusicProfile; className?: string }) {
  const [hover, setHover] = useState<Tile | null>(null);

  const tiles = useMemo<Tile[]>(() => {
    const entries = Object.entries(music.tracks);
    return entries.slice(0, MAX_TILES).map(([id, track]) => ({
      id,
      title: track.title ?? null,
      artist: track.channel ?? null,
      videoId: track.video_id,
      spectrum: music.track_spectra[id] ?? null,
    }));
  }, [music.tracks, music.track_spectra]);

  const measured = tiles.filter((t) => t.spectrum).length;

  if (!tiles.length) return null;

  return (
    <section className={cn("relative", className)} data-section="fingerprint">
      <div className="shell">
        <div className="grid items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow eyebrow-rule">The foundation</p>
            <h2 className="marquee mt-6 text-[clamp(2.6rem,6.2vw,6rem)]">
              <Lines onView>
                <>Your music left</>
                <>
                  a <em className="voice text-sunset">fingerprint</em>.
                </>
              </Lines>
            </h2>
          </div>
          <Reveal delay={0.15}>
            <p className="max-w-sm text-[14px] leading-relaxed text-ink-muted lg:pb-3">
              {plural(music.track_count, "song")} went through the analyser. Everything on this page rests on
              what came back from them.
            </p>
          </Reveal>
        </div>

        {/* A contact sheet that sizes itself to however many songs there are.
            The covers are cropped square to their centre, which is where an
            uploaded album sleeve sits inside a widescreen still. */}
        <div
          className="mt-12 grid gap-[3px] sm:mt-16"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${tiles.length <= 8 ? 168 : tiles.length <= 16 ? 132 : 96}px), 1fr))`,
          }}
          onPointerLeave={() => setHover(null)}
        >
          {tiles.map((tile, i) => {
            return (
              <motion.button
                key={tile.id}
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.7, delay: (i % 12) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                onPointerEnter={() => setHover(tile)}
                onFocus={() => setHover(tile)}
                aria-label={tile.title ?? "A measured song"}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-[3px] bg-elevated transition-[transform,filter,box-shadow,border-radius] duration-700 ease-(--ease-out-expo)",
                  "hover:z-10 hover:scale-[1.18] hover:rounded-md hover:shadow-[0_24px_50px_-18px_rgb(0_0_0/0.95)] focus-visible:z-10",
                  hover && hover.id !== tile.id ? "brightness-[0.32] saturate-[0.5]" : "",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl(tile.videoId)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="size-full scale-[1.34] object-cover"
                />
              </motion.button>
            );
          })}
        </div>

        {/* One readout under the mosaic rather than a tooltip over it: the covers
            stay uncovered and the figures stay legible. */}
        <div className="mt-6 flex min-h-[4.5rem] flex-wrap items-center gap-x-8 gap-y-2 border-t border-hairline pt-5">
          {hover ? (
            <>
              <span className="min-w-0">
                <span className="display block truncate text-[1.5rem] leading-tight text-ink">
                  {hover.title ?? "Untitled"}
                </span>
                {hover.artist && (
                  <span className="mt-0.5 block truncate text-[12px] text-ink-faint">{hover.artist}</span>
                )}
              </span>
              <span className="ml-auto flex items-center gap-4">
                {hover.spectrum ? (
                  <>
                    <span className="eyebrow">its spectrum</span>
                    <Spark
                      freqs={music.spectrum_freqs_hz}
                      values={hover.spectrum}
                      width={132}
                      height={36}
                      active
                    />
                  </>
                ) : (
                  <span className="text-[12px] text-ink-faint">not measured</span>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="text-[13px] text-ink-faint">
                Point at a cover to see the spectrum measured in that recording.
              </span>
              <span className="numeric ml-auto text-[12px] text-ink-faint">
                {measured} of {tiles.length} shown carry a measured spectrum
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
