"use client";

import { CLUSTER_COLORS } from "@/components/viz/listening-map";
import type { MusicProfile } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { percent, plural } from "@/lib/format";
import { thumbnailUrl } from "@/lib/youtube";
import Image from "next/image";

export function ClusterList({
  profile,
  active,
  onActivate,
}: {
  profile: MusicProfile;
  active: number | null;
  onActivate: (id: number | null) => void;
}) {
  const clusters = profile.data.clusters;
  return (
    <ul className="flex flex-col gap-2">
      {clusters.map((c) => {
        const color = CLUSTER_COLORS[c.id % CLUSTER_COLORS.length];
        const selected = active === c.id;
        return (
          <li key={c.id}>
            <button
              type="button"
              onMouseEnter={() => onActivate(c.id)}
              onMouseLeave={() => onActivate(null)}
              onFocus={() => onActivate(c.id)}
              onBlur={() => onActivate(null)}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition-all duration-300",
                selected ? "border-white/25 bg-white/[0.05]" : "border-hairline bg-white/[0.015]",
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: color, boxShadow: `0 0 12px ${color}` }}
                  />
                  <span className="text-[14px] text-ink">{c.label}</span>
                </span>
                <span className="numeric text-[12px] text-ink-faint">
                  {plural(c.size, "track")} · {percent(c.share)}
                </span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                <div className="h-full rounded-full" style={{ width: percent(c.share), background: color }} />
              </div>
              {c.representative_track_ids.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {c.representative_track_ids.map((id) => {
                    const track = profile.tracks[id];
                    if (!track) return null;
                    return (
                      <span key={id} className="flex items-center gap-2.5 text-[12px] text-ink-muted">
                        <span className="relative size-6 shrink-0 overflow-hidden rounded bg-elevated">
                          <Image
                            src={thumbnailUrl(track.video_id)}
                            alt=""
                            fill
                            sizes="24px"
                            className="object-cover"
                          />
                        </span>
                        <span className="truncate">{track.title ?? "Untitled"}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
