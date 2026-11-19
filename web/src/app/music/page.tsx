"use client";

import { FlowLoading, FlowShell } from "@/components/flow/flow-shell";
import { Lines } from "@/components/site/reveal";
import { ArtworkImage } from "@/components/ui/artwork-image";
import { useRequiredSession } from "@/components/flow/use-session";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { isApiError } from "@/lib/api/client";
import { useCreatePicks, useCreateSubmission, useLinkPreviews } from "@/lib/api/hooks";
import { useSpectralTransition } from "@/components/transition/spectral-transition";
import { filmAvailable, prefetchFilm } from "@/lib/film-prefetch";
import { USE_CASES, type UseCaseKey } from "@/lib/use-cases";
import { cn } from "@/lib/cn";
import { canonicalUrl, parseMusicLink, splitLinks, type ParsedLink } from "@/lib/youtube";
import { ArrowRight, ListMusic, Music2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const MAX_LINKS = 20;

type Row = ParsedLink & { key: string; useList: boolean };

const NOTES = [
  "Large playlists are sampled evenly, up to 120 songs.",
  "Spotify playlists are read for their song list; each song is then measured on YouTube.",
  "Live streams, long mixes and altered uploads are set aside.",
  "Audio is deleted as soon as it has been measured.",
];

const DIVE_FILM = "/film/ascent";

export default function MusicPage() {
  const { me, ready } = useRequiredSession();
  const router = useRouter();
  const create = useCreateSubmission();
  const [text, setText] = useState("");
  const [preferList, setPreferList] = useState<Record<string, boolean>>({});

  const rows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    return splitLinks(text).flatMap((raw) => {
      const parsed = parseMusicLink(raw);
      const key = parsed.ok ? `${parsed.kind}:${parsed.id}` : `bad:${raw}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ...parsed, key, useList: parsed.ok && !!preferList[key] }];
    });
  }, [text, preferList]);

  const valid = rows.filter((r): r is Row & { ok: true } => r.ok);
  const invalid = rows.filter((r) => !r.ok);
  const serverProblems = isApiError(create.error) ? create.error.problems : [];
  const tooMany = valid.length > MAX_LINKS;

  const urls = valid.map((r) =>
    r.kind === "video" && r.useList && r.playlistHint
      ? canonicalUrl({ kind: "playlist", id: r.playlistHint })
      : canonicalUrl(r),
  );
  const previews = useLinkPreviews(ready ? urls : []);

  const { begin } = useSpectralTransition();
  const picks = useCreatePicks();
  // The dive's frames are warmed while the listener is choosing their music.
  useEffect(() => {
    const id = window.setTimeout(() => void prefetchFilm(DIVE_FILM), 1500);
    return () => window.clearTimeout(id);
  }, []);
  const onward = (id: string) =>
    filmAvailable(DIVE_FILM) ? begin(`/analysis/${id}`, { via: "dive" }) : router.push(`/analysis/${id}`);

  const submit = () => {
    if (!valid.length || tooMany) return;
    // Handing over the music: the dive back into the sea, where the journey began.
    create.mutate(urls, { onSuccess: (s) => onward(s.id) });
  };

  const remove = (row: Row) => {
    const keep = splitLinks(text).filter((raw) => {
      const parsed = parseMusicLink(raw);
      const key = parsed.ok ? `${parsed.kind}:${parsed.id}` : `bad:${raw}`;
      return key !== row.key;
    });
    setText(keep.join("\n"));
    if (create.error) create.reset();
  };

  if (!ready || !me) {
    return (
      <FlowShell step="music">
        <FlowLoading />
      </FlowShell>
    );
  }

  const active = me.journey.active_submission_id;
  const adding = me.journey.has_music_profile;

  return (
    <FlowShell step="music" wide>
      {/* Three areas. On a wide screen the crate stands beside the other two;
          on a phone it falls between them, so the artwork appears directly
          under the links that produced it and the button stays last. */}
      <div className="grid flex-1 grid-cols-1 content-start gap-x-20 gap-y-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-y-8">
        {/* What you give it */}
        <div className="flex min-w-0 flex-col lg:pt-6">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="eyebrow eyebrow-rule"
          >
            {adding ? "Refine your sound" : `Nice to meet you, ${me.profile.display_name}`}
          </motion.p>
          <h1 className="marquee mt-7 text-[clamp(2.8rem,6vw,5.75rem)]">
            {adding ? (
              <Lines>
                <>
                  Add <em className="voice text-sunset">more</em>
                </>
                <>of what you love.</>
              </Lines>
            ) : (
              <Lines>
                <>Start with the</>
                <>
                  music you <em className="voice text-sunset">love</em>.
                </>
              </Lines>
            )}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="lede mt-7 max-w-xl"
          >
            Paste YouTube songs or playlists, a Spotify playlist, or all of them. AURALS measures the audio
            itself, so choose what you really listen to. Twenty songs or more draws a steady line.
          </motion.p>

          {active && (
            <div className="mt-8 flex flex-col gap-3 border-l border-ember/60 pl-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[14px] text-ink-muted">Some of your music is still being measured.</p>
              <ButtonLink href={`/analysis/${active}`} size="sm" variant="secondary">
                Watch it <ArrowRight className="size-3.5" />
              </ButtonLink>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="group well relative mt-10 rounded-[1.5rem] transition-shadow duration-700"
          >
            {/* The focus ring is the spectrum itself, drawn around the well. */}
            <div
              className="pointer-events-none absolute -inset-px rounded-[1.5rem] opacity-0 transition-opacity duration-700 group-focus-within:opacity-100"
              style={{
                background:
                  "linear-gradient(115deg, rgb(255 107 61 / 0.55), rgb(245 198 120 / 0.2) 38%, rgb(133 207 230 / 0.2) 68%, rgb(168 140 246 / 0.45))",
                mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
                padding: 1,
              }}
              aria-hidden="true"
            />
            <label htmlFor="links" className="sr-only">
              YouTube links
            </label>
            <textarea
              id="links"
              autoFocus
              rows={4}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (create.error) create.reset(); // server feedback refers to the old list
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              spellCheck={false}
              placeholder={"https://www.youtube.com/playlist?list=…\nhttps://youtu.be/…"}
              className="numeric block min-h-36 w-full resize-y bg-transparent px-6 pt-6 pb-4 text-[14px] leading-7 text-ink caret-ember outline-none placeholder:text-ink-faint/60 sm:px-7"
            />
            <div className="flex items-center justify-between gap-4 border-t border-hairline px-6 py-3.5 text-[12px] text-ink-faint sm:px-7">
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full transition-colors duration-500",
                    valid.length ? "bg-ok" : "bg-white/20",
                  )}
                  aria-hidden="true"
                />
                <span className={cn("truncate", valid.length && "text-ink-muted")}>
                  {valid.length
                    ? `${valid.length} link${valid.length === 1 ? "" : "s"} ready`
                    : "YouTube songs and playlists, Spotify playlists — one per line"}
                  {invalid.length ? ` · ${invalid.length} can't be used` : ""}
                </span>
              </span>
              <span className="numeric hidden shrink-0 text-[10px] tracking-[0.14em] uppercase sm:inline">
                Ctrl + Enter
              </span>
            </div>
          </motion.div>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {tooMany && (
            <ErrorNote className="mb-4">
              Add up to {MAX_LINKS} links at a time; playlists can hold many songs.
            </ErrorNote>
          )}
          {create.error && !serverProblems.length && (
            <ErrorNote className="mb-4">{create.error.message}</ErrorNote>
          )}

          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <ul className="max-w-md space-y-2 text-[13px] leading-relaxed text-ink-faint">
              {NOTES.map((note) => (
                <li key={note} className="flex gap-3">
                  <span className="mt-[0.65em] h-px w-3 shrink-0 bg-ink-faint/60" aria-hidden="true" />
                  {note}
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              onClick={submit}
              disabled={!valid.length || tooMany}
              loading={create.isPending}
              className="shrink-0"
            >
              Measure {valid.length > 1 ? `${valid.length} links` : "my music"}{" "}
              <ArrowRight className="size-4" />
            </Button>
          </div>

          {!adding && (
            <NoPlaylist
              pending={picks.isPending}
              error={picks.error?.message ?? null}
              onChoose={(genres) => picks.mutate(genres, { onSuccess: (s) => onward(s.id) })}
            />
          )}
        </div>

        {/* What it will listen to: the crate fills as links arrive. */}
        <aside
          className={cn(
            "min-w-0 lg:sticky lg:top-28 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:self-start",
            // Nothing pasted yet: on a phone the placeholder would only push the button away.
            rows.length === 0 && "hidden",
          )}
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-4">
            <p className="eyebrow">On the turntable</p>
            <p className="folio">
              <span className={cn(valid.length && "text-ink")}>{String(valid.length).padStart(2, "0")}</span>{" "}
              / {MAX_LINKS}
            </p>
          </div>

          {rows.length === 0 ? (
            <EmptyCrate />
          ) : (
            <ul className="flex flex-col" aria-live="polite">
              <AnimatePresence initial={false}>
                {rows.map((row) => {
                  const index = row.ok ? valid.indexOf(row as (typeof valid)[number]) : -1;
                  const problem = row.ok ? serverProblems.find((p) => p.index === index) : undefined;
                  const preview = index >= 0 ? previews[index]?.data : undefined;
                  const loading = index >= 0 && previews[index]?.isPending;
                  const spotify = row.ok && row.kind === "spotify_playlist";
                  const isList = row.ok && (row.kind === "playlist" || spotify || row.useList);
                  return (
                    <motion.li
                      key={row.key}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        "group/row flex items-center gap-5 border-b py-4",
                        row.ok && !problem ? "border-hairline" : "border-danger/30",
                      )}
                    >
                      <Sleeve
                        videoId={
                          row.ok && !spotify
                            ? (preview?.thumbnail_video_id ?? (isList ? null : row.id))
                            : null
                        }
                        artworkUrl={preview?.thumbnail_url ?? null}
                        list={isList}
                        bad={!row.ok}
                      />
                      <div className="min-w-0 flex-1">
                        {!row.ok ? (
                          <>
                            <p className="text-[15px] text-ink">{row.message}</p>
                            <p className="numeric mt-1 truncate text-[12px] text-ink-faint">{row.raw}</p>
                          </>
                        ) : loading ? (
                          <>
                            <span className="skeleton block h-4 w-2/3 rounded" />
                            <span className="skeleton mt-2.5 block h-3 w-1/3 rounded" />
                          </>
                        ) : (
                          <>
                            <p className="truncate text-[15px] text-ink">
                              {preview?.title ?? (isList ? "Playlist" : "Song")}
                            </p>
                            <p className="mt-1 truncate text-[12px] text-ink-faint">
                              {[
                                spotify
                                  ? "Spotify playlist"
                                  : isList
                                    ? row.useList
                                      ? "Whole playlist"
                                      : "YouTube playlist"
                                    : "Song",
                                preview?.author,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              {preview && !preview.title && " · no preview, we'll still try"}
                            </p>
                          </>
                        )}
                        {problem && <p className="mt-1.5 text-[12px] text-danger">{problem.message}</p>}
                        {row.ok && row.kind === "video" && row.playlistHint && (
                          <button
                            type="button"
                            onClick={() => setPreferList((p) => ({ ...p, [row.key]: !p[row.key] }))}
                            className="link-draw mt-2 pb-0.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
                          >
                            {row.useList ? "Just this song" : "Use its playlist"}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        aria-label="Remove link"
                        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </aside>
      </div>
    </FlowShell>
  );
}

/**
 * A record in its sleeve. A playlist shows the edge of the disc beside the
 * cover, which is the whole distinction between "one song" and "many" made
 * without a badge.
 */
function Sleeve({
  videoId,
  artworkUrl,
  list,
  bad,
}: {
  videoId: string | null;
  artworkUrl?: string | null;
  list: boolean;
  bad: boolean;
}) {
  const has = (videoId || artworkUrl) && !bad;
  return (
    <span className={cn("relative block size-16 shrink-0", list && !bad && "mr-3")}>
      {list && !bad && (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-[42%] size-[92%] -translate-y-1/2 rounded-full transition-transform duration-700 ease-(--ease-out-expo) group-hover/row:translate-x-1.5"
          style={{
            background:
              "radial-gradient(circle, #1c1c20 0 14%, #050506 15% 17%, #101013 18% 100%), repeating-radial-gradient(circle, transparent 0 2px, rgb(255 255 255 / 0.05) 2px 3px)",
            boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.07), 0 6px 14px -6px rgb(0 0 0 / 0.9)",
          }}
        />
      )}
      <span
        className={cn(
          "relative grid size-full place-items-center overflow-hidden rounded-[0.5rem] bg-elevated text-ink-faint",
          "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_24px_-10px_rgb(0_0_0/0.9)]",
          bad && "opacity-60",
        )}
      >
        {has ? (
          <ArtworkImage
            videoId={videoId}
            artworkUrl={artworkUrl}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
            fallback={list ? <ListMusic className="size-5" /> : <Music2 className="size-5" />}
          />
        ) : list ? (
          <ListMusic className="size-5" />
        ) : (
          <Music2 className="size-5" />
        )}
      </span>
    </span>
  );
}

/** Before anything is pasted: the shape of what will appear, and nothing invented. */
function EmptyCrate() {
  return (
    <div className="flex flex-col">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-5 border-b border-hairline py-4"
          style={{ opacity: 0.55 - i * 0.17 }}
          aria-hidden="true"
        >
          <span className="size-16 shrink-0 rounded-[0.5rem] border border-dashed border-white/15" />
          <span className="flex flex-1 flex-col gap-2.5">
            <span className="h-3.5 w-3/5 rounded bg-white/[0.06]" />
            <span className="h-2.5 w-1/3 rounded bg-white/[0.04]" />
          </span>
        </div>
      ))}
      <p className="mt-6 max-w-xs text-[13px] leading-relaxed text-ink-faint">
        Your songs and playlists appear here as you paste them, with their own artwork, before anything is
        measured.
      </p>
    </div>
  );
}

/**
 * For a listener without a playlist to hand: name the music, and AURALS measures
 * well-known songs from it — said plainly, here and on every page after, since
 * the result then describes those genres rather than this listener's own music.
 * Or skip music altogether: the listening session and the questions still draw
 * a sound.
 */
function NoPlaylist({
  pending,
  error,
  onChoose,
}: {
  pending: boolean;
  error: string | null;
  onChoose: (genres: UseCaseKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [genres, setGenres] = useState<UseCaseKey[]>([]);
  const music = USE_CASES.filter((u) => u.group === "music");
  const toggle = (k: UseCaseKey) => setGenres((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k]));
  return (
    <div className="mt-12 border-t border-hairline pt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">No playlist to hand?</p>
          <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
            Tell AURALS what you listen to and it will choose well-known songs from it — or skip music and let
            your ears and answers draw your sound.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Music2 className="size-3.5" /> Choose songs for me
          </Button>
          <ButtonLink href="/tune" variant="ghost" size="sm">
            Skip music
          </ButtonLink>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="genres"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="What you listen to">
              {music.map((g) => {
                const on = genres.includes(g.key);
                return (
                  <button
                    key={g.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(g.key)}
                    className={cn(
                      "rounded-full px-4 py-2 text-[13px] transition-[background-color,box-shadow,color] duration-300",
                      on
                        ? "bg-ember/12 text-ink shadow-[inset_0_0_0_1px_rgb(255_107_61/0.6)]"
                        : "text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] hover:text-ink",
                    )}
                  >
                    {g.title}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button size="md" onClick={() => onChoose(genres)} disabled={!genres.length} loading={pending}>
                Measure songs for me <ArrowRight className="size-4" />
              </Button>
              <p className="max-w-sm text-[12px] leading-snug text-ink-faint">
                Four or five widely known songs per genre. Your results will say they were AURALS&rsquo;s
                choice, not your playlist — add your own music any time for a truer read.
              </p>
            </div>
            {error && <ErrorNote className="mt-4">{error}</ErrorNote>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
