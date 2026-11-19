"use client";

import { SongStudio, type ChosenPart } from "@/components/tuning/song-studio";
import { isApiError } from "@/lib/api/client";
import { listenCurveQuery, type ListenCurve } from "@/lib/api/hooks";
import { audioContext, render } from "@/lib/audio/engine";
import { through } from "@/lib/audio/through";
import { cn } from "@/lib/cn";
import { useQueryClient } from "@tanstack/react-query";
import { Headphones, Info, Loader2, Music2, Pause, Play, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { output } from "@/lib/audio/volume";
import { VolumeInline } from "@/components/listen/volume";

/**
 * Listening through an earphone, anywhere in the site.
 *
 * Pick an earphone in the store or among your matches and your music plays
 * through its measured tuning (`lib/audio/through`). One bar at the foot of
 * the screen holds what is playing: the earphone, the song, and the switch
 * between hearing the song as it is and through that earphone. Switching —
 * earphone to earphone, or on and off — happens at the same playhead with a
 * short cross-fade, so the difference is all you hear. Every version is
 * level-matched.
 *
 * Until the listener chooses a song of their own, a short reference loop
 * synthesised in the browser plays; their own music (from their analysed
 * playlist or a file on their device) is one tap away.
 */

type Song = { id: number; buffer: AudioBuffer; title: string; artist: string; own: boolean };
type Ear = { curve: ListenCurve };

type Listening = {
  ear: Ear | null;
  song: Song | null;
  on: boolean;
  playing: boolean;
  pending: string | null;
  error: string | null;
  listen: (slug: string, label?: string) => void;
  setOn: (on: boolean) => void;
  toggle: () => void;
  choose: () => void;
  close: () => void;
};

const Context = createContext<Listening | null>(null);

const FADE = 0.06;

/** Pages with audio of their own, where the listening bar steps aside. */
const JOURNEY = ["/start", "/music", "/analysis", "/tune", "/world", "/edition"];

/** The audio: one looping voice at a time, swapped at the playhead. */
class Deck {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private voice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private origin = 0;
  private pausedAt = 0;
  private duration = 1;
  playing = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(output(ctx));
  }

  private position() {
    if (!this.playing) return this.pausedAt;
    const t = (this.ctx.currentTime - this.origin) % this.duration;
    return t < 0 ? t + this.duration : t;
  }

  private release(fade = FADE) {
    const old = this.voice;
    if (!old) return;
    const now = this.ctx.currentTime;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + fade);
    old.src.stop(now + fade + 0.02);
    this.voice = null;
  }

  /** Play `buffer` from where the music is now (or from `from`). */
  play(buffer: AudioBuffer, from?: number) {
    const at = (from ?? this.position()) % buffer.duration;
    this.release();
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE);
    src.connect(gain).connect(this.master);
    src.start(now, at);
    this.voice = { src, gain };
    this.duration = buffer.duration;
    this.origin = now - at;
    this.playing = true;
  }

  pause() {
    this.pausedAt = this.position();
    this.release(0.12);
    this.playing = false;
  }

  stop() {
    this.release(0.12);
    this.playing = false;
    this.pausedAt = 0;
  }
}

let nextSong = 1;

export function ListeningProvider({ children }: { children: ReactNode }) {
  const queries = useQueryClient();
  const deck = useRef<Deck | null>(null);
  const turn = useRef(0);
  const [ear, setEar] = useState<Ear | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [on, setOnState] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const ready = useCallback(() => {
    if (deck.current) return deck.current;
    const ctx = audioContext();
    if (!ctx) return null;
    deck.current = new Deck(ctx);
    return deck.current;
  }, []);

  /** Make `target` audible: the song, through the earphone when `hear` is on. */
  const sound = useCallback(
    async (target: { ear: Ear | null; song: Song; hear: boolean; from?: number }, label: string) => {
      const d = ready();
      if (!d) {
        setError("This browser can't play audio here.");
        return;
      }
      const mine = ++turn.current;
      void d.ctx.resume();
      setPending(label);
      setError(null);
      try {
        const buffer =
          target.hear && target.ear
            ? await through(
                target.song.buffer,
                target.ear.curve,
                target.ear.curve.slug + ":" + target.ear.curve.baseline_label,
              )
            : target.song.buffer;
        if (mine !== turn.current) return;
        d.play(buffer, target.from);
        setPlaying(true);
      } catch {
        if (mine === turn.current) setError("That couldn't be shaped just now.");
      } finally {
        if (mine === turn.current) setPending(null);
      }
    },
    [ready],
  );

  const defaultSong = useCallback(async (): Promise<Song | null> => {
    const d = ready();
    if (!d) return null;
    const buffer = await render(d.ctx.sampleRate);
    return { id: 0, buffer, title: "Reference loop", artist: "Synthesised in your browser", own: false };
  }, [ready]);

  const listen = useCallback(
    (slug: string, label?: string) => {
      const d = ready();
      if (!d) {
        setError("This browser can't play audio here.");
        return;
      }
      void d.ctx.resume();
      const mine = ++turn.current;
      setPending(label ? `Fetching ${label}` : "Fetching its measurement");
      setError(null);
      void (async () => {
        try {
          const curve = await queries.fetchQuery(listenCurveQuery(slug));
          if (mine !== turn.current) return;
          const next: Ear = { curve };
          const current = song ?? (await defaultSong());
          if (!current || mine !== turn.current) return;
          setEar(next);
          setSong(current);
          setOnState(true);
          await sound({ ear: next, song: current, hear: true }, `Shaping your music through ${curve.label}`);
        } catch (e) {
          if (mine !== turn.current) return;
          setPending(null);
          setError(
            isApiError(e) && e.status === 404
              ? "This one has no measurement on the reference rig, so it can't be heard."
              : "Its measurement couldn't be fetched just now.",
          );
        }
      })();
    },
    [defaultSong, queries, ready, song, sound],
  );

  const setOn = useCallback(
    (value: boolean) => {
      setOnState(value);
      if (song && playing) void sound({ ear, song, hear: value }, value ? "Shaping" : "As it is");
    },
    [ear, playing, song, sound],
  );

  const toggle = useCallback(() => {
    const d = deck.current;
    if (!d || !song) return;
    if (d.playing) {
      d.pause();
      setPlaying(false);
    } else {
      void sound({ ear, song, hear: on }, "Starting");
    }
  }, [ear, on, song, sound]);

  const close = useCallback(() => {
    turn.current++;
    deck.current?.stop();
    setPlaying(false);
    setEar(null);
    setPending(null);
    setError(null);
  }, []);

  const use = useCallback(
    (part: ChosenPart) => {
      setChoosing(false);
      const next: Song = {
        id: nextSong++,
        buffer: part.buffer,
        title: part.title,
        artist: part.artist,
        own: true,
      };
      setSong(next);
      void sound({ ear, song: next, hear: on, from: 0 }, "Shaping your song");
    },
    [ear, on, sound],
  );

  // Leaving the site, or the tab, stops the music rather than leaving it running.
  useEffect(() => () => deck.current?.stop(), []);

  // The journey's pages play their own listening examples: never two at once.
  // The bar's state is reset as the page changes (during render, as React
  // recommends for state derived from a prop); the audio itself stops in an effect.
  const pathname = usePathname();
  const away = JOURNEY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (away) {
      setEar(null);
      setPlaying(false);
      setPending(null);
      setError(null);
    }
  }
  useEffect(() => {
    if (!away) return;
    turn.current++;
    deck.current?.stop();
  }, [away]);

  return (
    <Context.Provider
      value={{
        ear,
        song,
        on,
        playing,
        pending,
        error,
        listen,
        setOn,
        toggle,
        choose: () => setChoosing(true),
        close,
      }}
    >
      {children}
      {/* Room at the foot of the page, so the bar never sits on its last lines. */}
      {(ear || pending || error) && <div aria-hidden="true" className="h-24" />}
      <ListeningBar />
      <AnimatePresence>
        {choosing && <SongStudio onUse={use} onClose={() => setChoosing(false)} />}
      </AnimatePresence>
    </Context.Provider>
  );
}

export function useListening() {
  const value = useContext(Context);
  if (!value) throw new Error("useListening must be used within ListeningProvider");
  return value;
}

/** The gain curve as a small line: the shape the music is taking on. */
function Shape({ curve, on, className }: { curve: ListenCurve; on: boolean; className?: string }) {
  const W = 132;
  const H = 34;
  const lo = Math.log10(20);
  const hi = Math.log10(20000);
  const d = curve.freqs_hz
    .map((f, i) => {
      const x = ((Math.log10(f) - lo) / (hi - lo)) * W;
      const y = H / 2 - (on ? Math.max(-12, Math.min(12, curve.gain_db[i])) : 0) * (H / 2 / 12);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="listen-shape" x1="0" x2="1">
          <stop offset="0" stopColor="#ff8a62" />
          <stop offset="0.5" stopColor="#f1d39b" />
          <stop offset="1" stopColor="#b9a6ff" />
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgb(255 236 222 / 0.12)" strokeDasharray="3 4" />
      <motion.path
        d={d}
        initial={false}
        animate={{ d }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        fill="none"
        stroke="url(#listen-shape)"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function Bars({ live }: { live: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-current"
          style={{
            height: live ? "100%" : "35%",
            animation: live
              ? `eq-bar 0.9s ${i * 0.13}s cubic-bezier(0.45,0,0.55,1) infinite alternate`
              : undefined,
          }}
        />
      ))}
    </span>
  );
}

function ListeningBar() {
  const { ear, song, on, playing, pending, error, setOn, toggle, choose, close } = useListening();
  const [notes, setNotes] = useState(false);
  const visible = Boolean(ear || pending || error);
  const curve = ear?.curve;
  const model = curve?.model ?? "";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 40, filter: "blur(8px)" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4"
          role="region"
          aria-label="Listening"
          data-listening-bar
        >
          <div className="relative w-full max-w-[56rem] rounded-[1.4rem] bg-[rgb(17_13_24/0.82)] p-2.5 shadow-[0_30px_80px_-24px_rgb(0_0_0/0.9),inset_0_0_0_1px_rgb(255_236_222/0.1)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="flex items-center gap-3">
              {/* The earphone. */}
              <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-[0.9rem] bg-[radial-gradient(circle_at_30%_20%,#3a2c3c,#15111b_75%)]">
                {curve?.image_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/iem-images/${curve.image_path}`}
                    alt=""
                    className="size-[86%] object-contain"
                  />
                ) : (
                  <Headphones className="size-5 text-ink-faint" />
                )}
              </div>
              <div className="min-w-0 flex-1 sm:flex-none sm:basis-[13rem]">
                <p className="flex items-center gap-2 text-[9.5px] tracking-[0.24em] text-ink-faint uppercase">
                  <span className={cn(playing && on && "text-sunset")}>
                    <Bars live={playing && !pending} />
                  </span>
                  {on ? "Listening through" : "Listening as it is"}
                </p>
                <p className="display mt-0.5 truncate text-[1.12rem] leading-tight text-ink">
                  {curve?.label ?? "…"}
                </p>
                <p className="truncate text-[11px] text-ink-faint">
                  {pending ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="size-3 animate-spin" /> {pending}
                    </span>
                  ) : error ? (
                    <span className="text-[#ff9b84]">{error}</span>
                  ) : curve ? (
                    <>
                      vs {curve.baseline === "device" ? `your ${curve.baseline_label}` : "neutral"}
                      {curve.converted ? " · converted measurement" : ""}
                    </>
                  ) : null}
                </p>
              </div>

              {/* As it is / through it. */}
              {curve && (
                <div className="hidden items-center gap-3 md:flex">
                  <div className="relative flex rounded-full bg-white/[0.05] p-1 text-[12px] shadow-[inset_0_0_0_1px_rgb(255_236_222/0.08)]">
                    {[
                      { value: false, label: "As it is" },
                      { value: true, label: `Through ${model}` },
                    ].map((o) => (
                      <button
                        key={String(o.value)}
                        type="button"
                        onClick={() => setOn(o.value)}
                        className={cn(
                          "relative z-10 max-w-[11rem] truncate rounded-full px-3.5 py-1.5 transition-colors",
                          on === o.value ? "text-[#1b1220]" : "text-ink-muted hover:text-ink",
                        )}
                        aria-pressed={on === o.value}
                      >
                        {on === o.value && (
                          <motion.span
                            layoutId="listen-switch"
                            className="absolute inset-0 -z-10 rounded-full bg-linear-to-r from-sun to-flamingo"
                            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                          />
                        )}
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <Shape curve={curve} on={on} className="hidden h-[34px] w-[132px] lg:block" />
                </div>
              )}

              {/* The song. */}
              <button
                type="button"
                onClick={choose}
                className="group ml-auto hidden max-w-[12rem] min-w-0 items-center gap-2 rounded-full py-1.5 pr-3 pl-2 text-left text-[12px] transition-colors hover:bg-white/[0.06] sm:flex"
                title="Choose your own song, and any part of it"
              >
                <Music2 className="size-4 shrink-0 text-ink-faint" />
                <span className="min-w-0">
                  <span className="block truncate text-ink">{song?.title ?? "Choose a song"}</span>
                  <span className="block truncate text-[10.5px] text-ink-faint group-hover:text-ink-muted">
                    {song?.own ? song.artist : "Use your own song →"}
                  </span>
                </span>
              </button>

              <VolumeInline className="hidden lg:flex" />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={toggle}
                  disabled={!song}
                  className="grid size-10 place-items-center rounded-full bg-linear-to-b from-bone to-ink text-canvas shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] transition-transform hover:scale-105 disabled:opacity-40"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
                </button>
                {curve && (
                  <button
                    type="button"
                    onClick={() => setNotes((v) => !v)}
                    className="grid size-9 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
                    aria-label="What you are hearing"
                    aria-expanded={notes}
                  >
                    <Info className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setNotes(false);
                    close();
                  }}
                  className="grid size-9 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
                  aria-label="Stop listening"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* What it is, and what it can't be. */}
            <AnimatePresence>
              {notes && curve && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-2 bottom-[calc(100%+0.6rem)] w-[min(26rem,calc(100vw-2rem))] rounded-[1.1rem] bg-[rgb(17_13_24/0.94)] p-4 text-[12px] leading-relaxed text-ink-muted shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9),inset_0_0_0_1px_rgb(255_236_222/0.1)] backdrop-blur-2xl"
                >
                  <p className="eyebrow text-ink-faint">What you are hearing</p>
                  <p className="mt-2 text-ink">
                    Your music re-shaped by {curve.label}&apos;s measured frequency response (
                    {curve.measured_by}
                    {curve.rig ? `, ${curve.rig}` : ""}), level-matched so it can&apos;t win by being louder.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {curve.notes.map((n) => (
                      <li key={n} className="flex gap-2">
                        <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" />
                        {n}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** "Listen" for one earphone: starts it, or shows that it is the one playing. */
export function ListenButton({
  slug,
  label,
  className,
  variant = "chip",
}: {
  slug: string;
  label: string;
  className?: string;
  variant?: "chip" | "solid";
}) {
  const { ear, playing, on, pending, listen } = useListening();
  const current = ear?.curve.slug === slug;
  const live = current && playing && on;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        listen(slug, label);
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-medium transition-[background-color,color,transform,box-shadow] duration-300",
        variant === "solid"
          ? "bg-linear-to-b from-bone to-ink px-5 py-2.5 text-[13.5px] text-canvas shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] hover:scale-[1.02]"
          : "bg-black/45 px-3 py-1.5 text-[11.5px] text-white/90 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] backdrop-blur-md hover:bg-black/60",
        live && variant === "chip" && "bg-linear-to-r from-sun to-flamingo text-[#1b1220] shadow-none",
        className,
      )}
      aria-label={live ? `Listening through ${label}` : `Listen through ${label}`}
      data-listen={slug}
      data-live={live || (current && Boolean(pending))}
    >
      {live ? (
        <Bars live />
      ) : current && pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Headphones className="size-3.5" />
      )}
      {live ? "Listening" : variant === "solid" ? "Hear your music through it" : "Listen"}
    </button>
  );
}
