"use client";

import { Arrival } from "@/components/analysis/arrival";
import { SignalStage } from "@/components/analysis/signal-stage";
import { SpinningRecords } from "@/components/analysis/spinning-records";
import { SongCompare } from "@/components/analysis/song-compare";
import { Stepper } from "@/components/analysis/stepper";
import { TrackList } from "@/components/analysis/track-list";
import { FlowLoading, FlowShell } from "@/components/flow/flow-shell";
import { useRequiredSession } from "@/components/flow/use-session";
import { ButtonLink } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { ArtworkImage } from "@/components/ui/artwork-image";
import { ListeningMap, type MapPoint } from "@/components/viz/listening-map";
import { isApiError, type Submission } from "@/lib/api/client";
import { isActive, useSubmission } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { columnQuantiles } from "@/lib/stats";
import { reasonLabel, sourceErrorLabel } from "@/lib/reasons";
import { ArrowRight, ListMusic, Music2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { use, useMemo, useState, type ReactNode } from "react";

export default function AnalysisPage({ params }: PageProps<"/analysis/[id]">) {
  const { id } = use(params);
  const session = useRequiredSession();
  const { data, error, isPending } = useSubmission(id);

  return (
    <FlowShell step="analysis" wide>
      {isPending || !session.ready ? (
        <FlowLoading label="Connecting to the analysis" />
      ) : error ? (
        <div className="mx-auto w-full max-w-xl py-16">
          <ErrorNote>{isApiError(error, 404) ? "We couldn't find that analysis." : error.message}</ErrorNote>
          <ButtonLink href="/music" variant="secondary" className="mt-6">
            Add music
          </ButtonLink>
        </div>
      ) : (
        <>
          {/* The handoff from the playlist, over the scanner it is revealing. */}
          <Arrival submission={data} />
          <AnalysisView
            submission={data}
            hasAnswers={session.me?.journey.has_questionnaire ?? false}
            needsWorld={!session.me?.profile.use_cases.length}
          />
        </>
      )}
    </FlowShell>
  );
}

function headline(s: Submission): { eyebrow: string; title: ReactNode } {
  switch (s.status) {
    case "completed":
      return {
        eyebrow: "Signal complete",
        title: (
          <>
            This is how your music <em>looks</em>.
          </>
        ),
      };
    case "failed":
      return {
        eyebrow: "Analysis stopped",
        title: (
          <>
            We couldn&rsquo;t measure <em>that</em>.
          </>
        ),
      };
    case "aggregating":
      return {
        eyebrow: "Almost there",
        title: (
          <>
            Folding it into one <em>line</em>…
          </>
        ),
      };
    case "analyzing":
      return {
        eyebrow: "Measuring",
        title: (
          <>
            Listening to your <em>music</em>…
          </>
        ),
      };
    default:
      return {
        eyebrow: "Starting",
        title: (
          <>
            Finding your <em>music</em>…
          </>
        ),
      };
  }
}

function AnalysisView({
  submission: s,
  hasAnswers,
  needsWorld,
}: {
  submission: Submission;
  hasAnswers: boolean;
  needsWorld: boolean;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const active = isActive(s.status);
  const { eyebrow, title } = headline(s);
  const selected = s.counts.total - s.counts.skipped;

  const median = useMemo(
    () =>
      columnQuantiles(
        s.tracks.filter((t) => t.spectrum).map((t) => t.spectrum!),
        [0.5],
      )[0],
    [s.tracks],
  );
  const focused = s.tracks.find((t) => t.id === focus) ?? null;

  const points = useMemo<MapPoint[]>(
    () =>
      s.tracks
        .filter((t) => t.point)
        .map((t) => ({
          id: t.id,
          x: t.point!.x,
          y: t.point!.y,
          title: t.title ?? "Untitled",
          subtitle: t.channel,
        })),
    [s.tracks],
  );

  return (
    <div className="flex flex-col">
      {/* Headline */}
      <div className="grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="eyebrow eyebrow-rule">
            {active && (
              <span className="relative mr-1 grid size-2 place-items-center" aria-hidden="true">
                <span className="absolute size-2 animate-ping rounded-full bg-ember/50" />
                <span className="size-1.5 rounded-full bg-ember" />
              </span>
            )}
            {eyebrow}
          </p>
          {/* The words change as the analysis moves on. Both copies share one grid
              cell and the box holds two lines, so nothing reflows while they swap. */}
          <div className="display mt-6 grid min-h-[1.9em] max-w-4xl text-[clamp(2.8rem,6.6vw,6.5rem)] leading-[0.94]">
            <AnimatePresence mode="wait">
              <motion.h1
                key={s.status}
                initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="col-start-1 row-start-1 self-start [&_em]:text-ember-soft"
              >
                {title}
              </motion.h1>
            </AnimatePresence>
          </div>
        </div>
        {/* The count is the page's one figure, so it is set as one. */}
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 lg:justify-end lg:pb-3">
          <SpinningRecords tracks={s.tracks} />
          {selected > 0 && (
            <p className="flex items-end gap-4">
              <span className="display text-[clamp(4.5rem,8vw,7.5rem)] leading-[0.74] text-ink">
                {s.counts.done}
              </span>
              <span className="pb-1 text-[13px] leading-snug text-ink-faint">
                <span className="numeric block text-ink-muted">/ {selected}</span>
                {selected === 1 ? "song" : "songs"} measured
                {s.counts.failed ? <span className="block">{s.counts.failed} unavailable</span> : null}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* The signal */}
      <section className="well relative mt-12 overflow-hidden rounded-[1.75rem] px-5 pt-6 pb-5 [--stage-veil:#050506] sm:mt-16 sm:px-9 sm:pt-8 sm:pb-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-1/3 -left-[12%] size-[55%] rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgb(255 122 58 / 0.12), transparent)" }}
        />
        <div className="relative">
          <SignalStage submission={s} focus={focus} />
        </div>
      </section>

      {/* Pipeline + next step */}
      <section className="mt-12 grid grid-cols-1 items-start gap-x-16 gap-y-10 sm:mt-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Stepper stages={s.stages} />
          {s.status === "failed" && (
            <div className="flex flex-col items-start gap-4">
              <ErrorNote>{s.error_message ?? "Something went wrong while processing your music."}</ErrorNote>
              <ButtonLink href="/music" variant="secondary">
                Try different links
              </ButtonLink>
            </div>
          )}
        </div>
        <NextStep status={s.status} hasAnswers={hasAnswers} needsWorld={needsWorld} />
      </section>

      {/* The songs */}
      {s.tracks.length > 0 && (
        <section className="mt-24 grid grid-cols-1 gap-x-16 gap-y-14 sm:mt-32 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="mb-6 flex items-end justify-between gap-4 border-b border-hairline pb-5">
              <div>
                <p className="eyebrow eyebrow-rule">The evidence</p>
                <h2 className="marquee mt-4 text-[clamp(2rem,3.6vw,3.25rem)] leading-none">Your songs</h2>
              </div>
              <p className="numeric pb-1 text-right text-[11px] leading-relaxed text-ink-faint">
                {s.counts.done} measured · {s.counts.queued + s.counts.analyzing} waiting
                {s.counts.failed ? ` · ${s.counts.failed} unavailable` : ""}
              </p>
            </div>
            <TrackList tracks={s.tracks} freqs={s.spectrum_freqs_hz} focus={focus} onFocus={setFocus} />
          </div>

          <aside className="flex min-w-0 flex-col gap-12 lg:sticky lg:top-28 lg:self-start">
            {s.spectrum_freqs_hz && median.length > 0 && (
              <SongCompare freqs={s.spectrum_freqs_hz} median={median} track={focused} />
            )}
            <div>
              <p className="eyebrow">Where they sit</p>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
                Brightness against energy, relative to a reference set of music.{" "}
                <span className="text-ink-muted">Heuristic.</span>
              </p>
              {points.length ? (
                <ListeningMap points={points} height={240} focusId={focus} className="mt-2" />
              ) : (
                <div className="well mt-4 grid h-48 place-items-center rounded-2xl text-[12px] text-ink-faint">
                  {active ? "Songs will appear here" : "No data"}
                </div>
              )}
            </div>
            <SourceList sources={s.sources} />
            {Object.keys(s.reasons).length > 0 && (
              <div className="flex flex-col gap-1.5 text-[12px] text-ink-faint">
                <p className="eyebrow mb-1">Not measured</p>
                {Object.entries(s.reasons).map(([code, n]) => (
                  <p key={code} className="flex justify-between gap-4">
                    <span>{reasonLabel(code)}</span>
                    <span className="numeric">{n}</span>
                  </p>
                ))}
              </div>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}

function NextStep({
  status,
  hasAnswers,
  needsWorld,
}: {
  status: Submission["status"];
  hasAnswers: boolean;
  needsWorld: boolean;
}) {
  if (status === "failed") return null;
  const done = status === "completed";
  if (!done && hasAnswers) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-faint lg:pt-4">
        Your answers are in. Your sound profile will update as soon as the last song is measured.
      </p>
    );
  }
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="surface relative overflow-hidden rounded-[1.5rem] p-7 sm:p-9"
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-1/2 -right-1/4 size-[85%] rounded-full blur-3xl transition-opacity duration-1000",
          done ? "opacity-100" : "opacity-40",
        )}
        style={{ background: "radial-gradient(closest-side, rgb(255 122 58 / 0.16), transparent)" }}
      />
      <div className="relative">
        {done ? (
          <>
            <p className="display text-[clamp(1.9rem,3vw,2.6rem)] leading-none text-ink [&_em]:text-ember-soft">
              {hasAnswers ? (
                <>
                  Your sound is <em>ready</em>.
                </>
              ) : (
                <>
                  Your signature is <em>drawn</em>.
                </>
              )}
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-muted">
              {hasAnswers
                ? "Your music sets its shape; your answers refine it."
                : "Your music now sets the shape of your sound. A few quick questions refine it, and tell us what music can\u2019t show."}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink href={!hasAnswers ? "/tune" : needsWorld ? "/world" : "/match"}>
                {!hasAnswers ? "Refine it" : needsWorld ? "Where you'’ll use them" : "See your sound"}{" "}
                <ArrowRight className="size-4" />
              </ButtonLink>
              {!hasAnswers && (
                <Link
                  href="/match"
                  className="link-draw pb-0.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
                >
                  See it from your music alone
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="display text-[clamp(1.9rem,3vw,2.6rem)] leading-none text-ink [&_em]:text-ember-soft">
              While we <em>listen</em>…
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-muted">
              Your signature is still forming. You can answer a few questions meanwhile; they&rsquo;ll refine
              it once measuring is done.
            </p>
            <ButtonLink href="/tune" variant="secondary" className="mt-7">
              Answer while you wait <ArrowRight className="size-4" />
            </ButtonLink>
          </>
        )}
      </div>
    </motion.div>
  );
}

function SourceList({ sources }: { sources: Submission["sources"] }) {
  const playlists = sources.filter((src) => src.kind !== "video");
  const videos = sources.filter((src) => src.kind === "video");
  const pendingVideos = videos.filter((v) => v.status === "pending").length;
  const failedVideos = videos.filter((v) => v.status === "failed").length;
  const row = (
    key: string,
    icon: ReactNode,
    title: string,
    subtitle: string,
    muted = false,
    cover?: string | null,
  ) => (
    <div key={key} className="flex items-center gap-3 text-[13px]">
      <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-elevated text-ink-faint shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
        {cover ? (
          <ArtworkImage videoId={null} artworkUrl={cover} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          icon
        )}
      </span>
      <div className="min-w-0">
        <p className={cn("truncate", muted ? "text-ink-faint" : "text-ink")}>{title}</p>
        {subtitle && <p className="truncate text-[12px] text-ink-faint">{subtitle}</p>}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <p className="eyebrow mb-1">From</p>
      {playlists.map((src) =>
        row(
          src.external_id,
          <ListMusic className="size-3.5" />,
          src.title ?? (src.status === "pending" ? "Looking up playlist…" : "Playlist"),
          src.status === "failed"
            ? sourceErrorLabel(src.error_code)
            : [
                src.kind === "spotify_playlist" ? "Spotify" : src.channel,
                src.total_entries != null ? plural(src.total_entries, "track") : null,
              ]
                .filter(Boolean)
                .join(" · "),
          src.status === "failed",
          src.cover_url,
        ),
      )}
      {videos.length > 0 &&
        row(
          "videos",
          <Music2 className="size-3.5" />,
          plural(videos.length, "individual song"),
          pendingVideos
            ? `Looking up ${pendingVideos}…`
            : failedVideos
              ? `${failedVideos} couldn't be opened`
              : "All found",
        )}
    </div>
  );
}
