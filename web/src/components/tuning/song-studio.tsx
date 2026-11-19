"use client";

import { useTuningSongs } from "@/lib/api/hooks";
import { audioContext } from "@/lib/audio/engine";
import { cn } from "@/lib/cn";
import { HardDrive, ListMusic, Loader2, Pause, Play, Sparkles, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { output } from "@/lib/audio/volume";

/**
 * Choosing your own music for the listening session: any song, any part of it.
 *
 * A song comes from the listener's own analysed playlist (fetched whole by the
 * server, from that playlist only) or from a file on their device, which is
 * decoded here and never leaves the browser. The whole song is drawn as a
 * waveform; a 20-second window is dragged to the part they want, and plays on a
 * loop while it is moved. The chosen part is loudness-normalised exactly as the
 * server's clips are, so every tuning in the duel is heard at the same level.
 */

export const PART_SECONDS = 20;
const BINS = 220;
const TARGET_RMS = 10 ** (-18 / 20);
const ease = [0.16, 1, 0.3, 1] as const;

export type ChosenPart = { buffer: AudioBuffer; title: string; artist: string; start: number };

type Loaded = { buffer: AudioBuffer; title: string; artist: string };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function envelope(buffer: AudioBuffer, bins: number) {
  const data = buffer.getChannelData(0);
  const per = Math.max(1, Math.floor(data.length / bins));
  const out: number[] = [];
  let top = 0;
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    const end = Math.min(data.length, (b + 1) * per);
    for (let i = b * per; i < end; i += 8) sum += data[i] * data[i];
    const v = Math.sqrt(sum / Math.max(1, (end - b * per) / 8));
    out.push(v);
    top = Math.max(top, v);
  }
  return out.map((v) => Math.sqrt(v / Math.max(1e-6, top)));
}

/** The strongest sustained stretch: where to put the window first. */
function loudest(levels: number[], duration: number) {
  const span = Math.max(1, Math.round((PART_SECONDS / duration) * levels.length));
  let best = 0;
  let bestSum = -1;
  for (let i = Math.floor(levels.length * 0.06); i + span <= levels.length; i++) {
    let sum = 0;
    for (let k = i; k < i + span; k++) sum += levels[k];
    if (sum > bestSum) {
      bestSum = sum;
      best = i;
    }
  }
  return (best / levels.length) * duration;
}

/** The chosen part, cut, faded and set to the duel's loudness. */
export function cutPart(ctx: BaseAudioContext, source: AudioBuffer, start: number): AudioBuffer {
  const rate = source.sampleRate;
  const from = Math.floor(start * rate);
  const length = Math.min(Math.floor(PART_SECONDS * rate), source.length - from);
  const out = ctx.createBuffer(source.numberOfChannels, length, rate);
  let sum = 0;
  for (let c = 0; c < source.numberOfChannels; c++) {
    const data = source.getChannelData(c).subarray(from, from + length);
    out.copyToChannel(data, c);
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  }
  const rms = Math.sqrt(sum / Math.max(1, length * source.numberOfChannels)) || 1e-6;
  let gain = TARGET_RMS / rms;
  let peak = 0;
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i] * gain));
  }
  if (peak > 0.97) gain *= 0.97 / peak;
  const fade = Math.floor(0.25 * rate);
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const edge = Math.min(1, i / fade, (d.length - 1 - i) / fade);
      d[i] *= gain * edge;
    }
  }
  return out;
}

export function SongStudio({ onUse, onClose }: { onUse: (part: ChosenPart) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"playlist" | "device">("playlist");
  const songs = useTuningSongs(tab === "playlist");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const open = async (title: string, artist: string, get: () => Promise<ArrayBuffer>) => {
    const ctx = audioContext();
    if (!ctx) {
      setFailure("This browser cannot play audio here.");
      return;
    }
    setLoading(title);
    setFailure(null);
    try {
      const buffer = await ctx.decodeAudioData(await get());
      if (buffer.duration < PART_SECONDS + 1) throw new Error("That song is shorter than 20 seconds.");
      setLoaded({ buffer, title, artist });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "That audio could not be opened.");
    } finally {
      setLoading(null);
    }
  };

  const fromPlaylist = (videoId: string, title: string, artist: string) =>
    open(title, artist, async () => {
      const res = await fetch(`/api/tuning/songs/${encodeURIComponent(videoId)}/audio`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("That song could not be fetched just now.");
      return res.arrayBuffer();
    });

  const fromFile = (file: File) =>
    open(file.name.replace(/\.[^.]+$/, ""), "From this device", () => file.arrayBuffer());

  const list = (songs.data ?? []).filter((s) =>
    `${s.title} ${s.artist}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-0 backdrop-blur-md sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose your own music"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.55, ease }}
        onClick={(e) => e.stopPropagation()}
        className="glass relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-[1.8rem] p-6 sm:rounded-[1.8rem] sm:p-9"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 grid size-9 place-items-center rounded-full text-ink-muted transition-[background-color,transform] duration-500 hover:rotate-90 hover:bg-white/[0.06] hover:text-ink"
        >
          <X className="size-4" />
        </button>
        <p className="eyebrow eyebrow-rule">Your own music</p>
        <h2 className="marquee mt-4 text-[clamp(2rem,4.4vw,3.2rem)]">
          Any song, <em className="voice text-sunset">any part</em>.
        </h2>

        <AnimatePresence mode="wait" initial={false}>
          {loaded ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease }}
            >
              <PartPicker
                song={loaded}
                onBack={() => setLoaded(null)}
                onUse={(start) => {
                  const ctx = audioContext();
                  if (!ctx) return;
                  onUse({
                    buffer: cutPart(ctx, loaded.buffer, start),
                    title: loaded.title,
                    artist: loaded.artist,
                    start,
                  });
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease }}
            >
              <div
                className="mt-6 flex gap-1 rounded-xl bg-white/[0.03] p-1 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]"
                role="tablist"
              >
                {(
                  [
                    ["playlist", "Your playlist", ListMusic],
                    ["device", "From this device", HardDrive],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={cn(
                      "relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[13px] transition-colors",
                      tab === key ? "text-ink" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {tab === key && (
                      <motion.span
                        layoutId="studio-tab"
                        className="absolute inset-0 rounded-lg bg-white/[0.09]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <Icon className="relative size-4" />
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>

              {tab === "playlist" ? (
                <div className="mt-5">
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Find a song"
                    aria-label="Find a song"
                    className="w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] outline-none placeholder:text-ink-faint focus:shadow-[inset_0_0_0_1px_rgb(255_236_222/0.4)]"
                  />
                  <ul className="mt-3 max-h-[46dvh] overflow-y-auto pr-1">
                    {list.map((s, i) => (
                      <motion.li
                        key={s.video_id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: Math.min(i, 12) * 0.025, ease }}
                      >
                        <button
                          type="button"
                          disabled={Boolean(loading)}
                          onClick={() => void fromPlaylist(s.video_id, s.title, s.artist)}
                          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-sun/30 to-flamingo/30 text-ink transition-transform group-hover:scale-110">
                            {loading === s.title ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Play className="size-3.5 translate-x-px fill-current" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-ink">
                              {s.title || "Untitled"}
                            </span>
                            <span className="block truncate text-[12px] text-ink-faint">{s.artist}</span>
                          </span>
                          {s.duration_s && (
                            <span className="numeric text-[11px] text-ink-faint">{clock(s.duration_s)}</span>
                          )}
                        </button>
                      </motion.li>
                    ))}
                    {songs.data && songs.data.length === 0 && (
                      <li className="px-3 py-4 text-[13px] text-ink-faint">
                        No analysed songs yet — add a playlist first, or use a file from this device.
                      </li>
                    )}
                  </ul>
                  {loading && (
                    <p className="mt-3 text-[12px] text-ink-faint">
                      Fetching the whole song, so you can choose any part of it…
                    </p>
                  )}
                </div>
              ) : (
                <DropZone busy={Boolean(loading)} onFile={(f) => void fromFile(f)} />
              )}
              {failure && <p className="mt-4 text-[13px] text-flamingo">{failure}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function DropZone({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center transition-[background-color,border-color] duration-300",
          over
            ? "border-sun/70 bg-sun/[0.06]"
            : "border-white/15 hover:border-white/30 hover:bg-white/[0.02]",
        )}
      >
        {busy ? <Loader2 className="size-6 animate-spin text-sun" /> : <Upload className="size-6 text-sun" />}
        <span className="text-[15px] text-ink">
          {busy ? "Opening…" : "Drop a song here, or choose a file"}
        </span>
        <span className="max-w-sm text-[12px] leading-relaxed text-ink-faint">
          MP3, M4A, WAV, FLAC or OGG. It is opened in your browser and never uploaded.
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** The whole song as a waveform, with a 20-second window to drag to any part. */
function PartPicker({
  song,
  onBack,
  onUse,
}: {
  song: Loaded;
  onBack: () => void;
  onUse: (start: number) => void;
}) {
  const duration = song.buffer.duration;
  const levels = useMemo(() => envelope(song.buffer, BINS), [song.buffer]);
  const suggested = useMemo(() => loudest(levels, duration), [levels, duration]);
  const [start, setStart] = useState(suggested);
  const [playing, setPlaying] = useState(false);
  const node = useRef<AudioBufferSourceNode | null>(null);
  const startedAt = useRef(0);
  const head = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const max = Math.max(0, duration - PART_SECONDS);
  const span = (PART_SECONDS / duration) * 100;

  const stop = useCallback(() => {
    node.current?.stop();
    node.current?.disconnect();
    node.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const play = useCallback(
    (from: number) => {
      const ctx = audioContext();
      if (!ctx) return;
      void ctx.resume();
      stop();
      const src = ctx.createBufferSource();
      src.buffer = song.buffer;
      src.loop = true;
      src.loopStart = from;
      src.loopEnd = from + PART_SECONDS;
      src.connect(output(ctx));
      src.start(0, from);
      startedAt.current = ctx.currentTime;
      node.current = src;
      setPlaying(true);
    },
    [song.buffer, stop],
  );

  // The playhead, on the audio clock.
  useEffect(() => {
    if (!playing) return;
    const ctx = audioContext();
    if (!ctx) return;
    let frame = 0;
    const tick = () => {
      const t = (ctx.currentTime - startedAt.current) % PART_SECONDS;
      if (head.current) head.current.style.left = `${((start + t) / duration) * 100}%`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, start, duration]);

  const at = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * duration;
  };
  const moveTo = (s: number) => {
    const next = Math.max(0, Math.min(max, s));
    setStart(next);
    return next;
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[16px] text-ink">{song.title}</p>
          <p className="truncate text-[12px] text-ink-faint">{song.artist}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-[12px] text-ink-faint underline-offset-4 hover:text-ink hover:underline"
        >
          Another song
        </button>
      </div>

      {/* The song, and the part. */}
      <div
        ref={track}
        className="relative mt-6 h-36 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const t = at(e.clientX);
          // Inside the window: carry it. Outside: centre it where pressed.
          drag.current = t >= start && t <= start + PART_SECONDS ? t - start : PART_SECONDS / 2;
          moveTo(t - drag.current);
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) moveTo(at(e.clientX) - drag.current);
        }}
        onPointerUp={() => {
          if (drag.current === null) return;
          drag.current = null;
          play(start);
        }}
        aria-label="Drag the window to choose the part"
      >
        <div className="absolute inset-0 flex items-center gap-[2px]" aria-hidden="true">
          {levels.map((v, i) => {
            const t = ((i + 0.5) / levels.length) * duration;
            const inside = t >= start && t <= start + PART_SECONDS;
            return (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors duration-200",
                  inside ? "bg-linear-to-t from-coral via-sun to-[#b9a6ff]" : "bg-white/14",
                )}
                style={{ height: `${Math.max(4, v * 100)}%` }}
              />
            );
          })}
        </div>
        <motion.div
          className="pointer-events-none absolute inset-y-[-6px] rounded-xl shadow-[inset_0_0_0_1.5px_rgb(255_236_222/0.75),0_0_40px_-6px_rgb(255_160_120/0.55)]"
          style={{
            left: `${(start / duration) * 100}%`,
            width: `${span}%`,
            background: "linear-gradient(180deg, rgb(255 200 160 / 0.08), rgb(255 140 110 / 0.04))",
          }}
        >
          <span className="numeric absolute -top-6 left-0 text-[10.5px] whitespace-nowrap text-ink-muted">
            {clock(start)}
          </span>
          <span className="numeric absolute -top-6 right-0 text-[10.5px] whitespace-nowrap text-ink-muted">
            {clock(start + PART_SECONDS)}
          </span>
        </motion.div>
        {playing && (
          <span
            ref={head}
            className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_10px_rgb(255_255_255/0.9)]"
          />
        )}
      </div>
      <div className="numeric mt-2 flex justify-between text-[10.5px] text-ink-faint">
        <span>0:00</span>
        <span>{clock(duration)}</span>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (playing ? (stop(), setPlaying(false)) : play(start))}
          className="flex h-11 items-center gap-2 rounded-full px-5 text-[14px] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)] transition-colors hover:bg-white/[0.05]"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
          {playing ? "Pause" : "Hear this part"}
        </button>
        <button
          type="button"
          onClick={() => play(moveTo(suggested))}
          className="flex h-11 items-center gap-2 rounded-full px-4 text-[13px] text-ink-muted transition-colors hover:text-ink"
        >
          <Sparkles className="size-4 text-sun" /> The loudest part
        </button>
        <button
          type="button"
          onClick={() => {
            stop();
            setPlaying(false);
            onUse(start);
          }}
          className="ml-auto flex h-11 items-center gap-2 rounded-full bg-linear-to-r from-[#f6e3c4] to-[#ecc8a8] px-6 text-[14px] font-medium text-[#1b1220] shadow-[0_10px_30px_-12px_rgb(246_200_160/0.8)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          Use this part
        </button>
      </div>
      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
        Drag the window, or tap anywhere on the song to move it there. The part is matched in loudness like
        every clip in the session.
      </p>
    </div>
  );
}
