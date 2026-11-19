"use client";

import { BandEmphasis } from "@/components/profile/band-emphasis";
import { ClusterList } from "@/components/profile/cluster-list";
import { BandRail } from "@/components/signature/band-rail";
import {
  SignatureStage,
  StageAxis,
  StageBand,
  StageLine,
  StageReference,
  StageTraces,
} from "@/components/signature/stage";
import { ListeningMap } from "@/components/viz/listening-map";
import type { MusicProfile } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { ChevronDown, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";

const MEASURES: { key: string; label: string; format: (v: number) => string }[] = [
  { key: "tempo_bpm", label: "Typical tempo", format: (v) => `${Math.round(v)} BPM` },
  { key: "integrated_lufs", label: "Loudness", format: (v) => `${v.toFixed(1)} LUFS` },
  { key: "loudness_range_lu", label: "Loudness range", format: (v) => `${v.toFixed(1)} LU` },
  { key: "side_to_mid_db", label: "Stereo side level", format: (v) => `${v.toFixed(1)} dB` },
  { key: "centroid_hz", label: "Spectral centroid", format: (v) => `${(v / 1000).toFixed(2)} kHz` },
];

/** The listening signature: the foundation the profile is built on. */
export function MusicSection({ music }: { music: MusicProfile }) {
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const d = music.data;
  const spectrum = d.spectrum;
  const measures = Object.fromEntries(d.measures.map((m) => [m.key, m]));
  const traces = useMemo(
    () => Object.entries(music.track_spectra).map(([id, values]) => ({ id, values })),
    [music.track_spectra],
  );
  const clusterTracks = new Set(
    activeCluster === null ? [] : d.map.filter((p) => p.cluster === activeCluster).map((p) => p.track_id),
  );
  const points = d.map.map((p) => ({
    id: p.track_id,
    x: p.x,
    y: p.y,
    cluster: p.cluster,
    muted: p.flag !== null && p.flag !== undefined,
    title: music.tracks[p.track_id]?.title ?? "Untitled",
    subtitle:
      p.flag === "outlier"
        ? "Atypical: down-weighted"
        : p.flag === "duplicate"
          ? "Duplicate: counted once"
          : music.tracks[p.track_id]?.channel,
  }));

  return (
    <section id="music" className="scroll-mt-24">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr] md:items-end">
        <div>
          <p className="eyebrow">The evidence</p>
          <h2 className="marquee mt-4 text-[clamp(2.4rem,5vw,4.2rem)]">
            What you <em>actually</em> play.
          </h2>
        </div>
        <p className="max-w-md text-[15px] leading-relaxed text-ink-muted md:justify-self-end">
          Every one of your {plural(d.counts.analysed, "song")}, measured. The line through them is your
          listening signature, the foundation your sound is built on.
        </p>
      </div>

      <div className="mt-12">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-faint">
          <span>
            {activeCluster === null
              ? "Every song, with the typical shape and its middle half"
              : `Songs in “${d.clusters.find((c) => c.id === activeCluster)?.label}”`}
          </span>
          <span className="numeric tracking-wider uppercase">Measured · dB per octave vs midrange</span>
        </div>
        <SignatureStage
          height={340}
          domain={[-32, 14]}
          pad={{ bottom: 20 }}
          label="Your listening signature: the median spectrum of your songs"
        >
          <StageReference value={0} label="midrange" />
          <StageTraces
            freqs={music.spectrum_freqs_hz}
            traces={activeCluster === null ? traces : traces.filter((t) => clusterTracks.has(t.id))}
            opacity={activeCluster === null ? 0.14 : 0.45}
          />
          <StageBand
            freqs={spectrum.freqs_hz}
            lower={spectrum.p25_db}
            upper={spectrum.p75_db}
            opacity={activeCluster === null ? 0.16 : 0.06}
          />
          <StageLine
            series={{ freqs: spectrum.freqs_hz, values: spectrum.median_db }}
            opacity={activeCluster === null ? 1 : 0.5}
          />
          <StageAxis ticks={[20, 100, 1000, 10000, 20000]} />
        </SignatureStage>
        <BandRail className="mt-3" />
      </div>

      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <h3 className="text-[15px] text-ink">Sonic groups</h3>
          <p className="mt-1 mb-4 text-[12px] text-ink-faint">
            Songs grouped by how they sound, not by genre. Hover to find them above and on the map.
          </p>
          <ClusterList profile={music} active={activeCluster} onActivate={setActiveCluster} />
        </div>
        <div>
          <h3 className="text-[15px] text-ink">Where they sit</h3>
          <p className="mt-1 text-[12px] text-ink-faint">
            Brightness against energy, relative to a reference set of music.
          </p>
          <ListeningMap
            points={points}
            colorBy="cluster"
            highlight={activeCluster}
            height={340}
            className="mt-2"
          />
        </div>
      </div>

      <div className="mt-12 border-t border-hairline">
        <button
          type="button"
          onClick={() => setDetails((v) => !v)}
          aria-expanded={details}
          className="flex w-full items-center justify-between py-5 text-left text-[14px] text-ink-muted transition-colors hover:text-ink"
        >
          Technical detail: band emphasis, descriptors and measurements
          <ChevronDown className={cn("size-4 transition-transform", details && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {details && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-12 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                  <p className="mb-5 text-[12px] text-ink-faint">
                    Band emphasis: how much each band&rsquo;s content departs from typical music (centre
                    line). Heuristic.
                  </p>
                  <BandEmphasis bands={d.bands} />
                </div>
                <div className="flex flex-col gap-8">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                    {d.descriptors.map((desc) => (
                      <div key={desc.key}>
                        <dt className="text-[11px] text-ink-faint">{desc.label}</dt>
                        <dd className="numeric mt-0.5 text-[16px] text-ink">
                          {desc.value.median.toFixed(2)}
                        </dd>
                      </div>
                    ))}
                    {MEASURES.map(({ key, label, format }) =>
                      measures[key] ? (
                        <div key={key}>
                          <dt className="text-[11px] text-ink-faint">{label}</dt>
                          <dd className="numeric mt-0.5 text-[16px] text-ink">
                            {format(measures[key].value.median)}
                          </dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                  <p className="text-[12px] leading-relaxed text-ink-faint">
                    Descriptors run 0–1 where 0.5 is typical for the {d.calibration} reference corpus.
                  </p>
                  {d.notes.length > 0 && (
                    <ul className="flex flex-col gap-2 text-[12px] leading-relaxed text-ink-faint">
                      {d.notes.map((note) => (
                        <li key={note} className="flex gap-2">
                          <Info className="mt-0.5 size-3.5 shrink-0" /> {note}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href="/method"
                    className="text-[12px] text-ink-muted underline decoration-white/20 underline-offset-4 hover:text-ink"
                  >
                    How this is measured and inferred
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
