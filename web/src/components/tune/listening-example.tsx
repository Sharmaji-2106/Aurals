"use client";

import {
  audioContext,
  BED_SECONDS,
  loadExample,
  peaks,
  render,
  renderClip,
  type Filter,
} from "@/lib/audio/engine";
import { cn } from "@/lib/cn";
import { Music2, Pause, Play, RotateCcw, Shuffle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { output } from "@/lib/audio/volume";

/**
 * A short A/B for a question about tone.
 *
 * When the listener's music is ready, each question plays its own song from
 * their playlist, at the moment that shows off what the question asks about
 * (`backend/…/tuning/examples.py`): the heaviest bass, the most forward
 * vocal, the brightest stretch. Otherwise a short passage synthesised here.
 * Both sides are the same audio through two filter chains, level-matched, so
 * the difference heard is the treatment and not the loudness.
 */

export type Variant = { id: string; label: string; filters: Filter[] };

/** One of the listener's songs, cut for a question. */
export type ExampleClip = { question: string; url: string; title: string; artist: string };

const BINS = 96;

/** What each question's clip was cut to show. */
const MOMENT: Record<string, string> = {
  bass_amount: "where the bass hits hardest",
  bass_character: "a bass-heavy stretch",
  vocals: "where the voice is most forward",
  treble_feel: "the brightest stretch",
  tone: "its fullest moment",
};

export function ListeningExample({
  variants,
  clips = [],
  className,
}: {
  variants: Variant[];
  /** This question's clip first, then the listener's others to try instead. */
  clips?: ExampleClip[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const [song, setSong] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused" | "unavailable">("idle");
  const [shape, setShape] = useState<number[] | null>(null);
  const [length, setLength] = useState(BED_SECONDS);

  const source = useRef<AudioBufferSourceNode | null>(null);
  const startedAt = useRef(0); // ctx.currentTime that maps to position 0
  const position = useRef(0);
  const head = useRef<HTMLSpanElement>(null);
  const trail = useRef<HTMLSpanElement>(null);
  const clip = clips[song % Math.max(1, clips.length)] ?? null;

  const stop = useCallback(() => {
    source.current?.stop();
    source.current?.disconnect();
    source.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const paint = useCallback(
    (seconds: number) => {
      const p = Math.min(1, Math.max(0, seconds / length));
      if (head.current) head.current.style.left = `${p * 100}%`;
      if (trail.current) trail.current.style.width = `${p * 100}%`;
    },
    [length],
  );

  // The playhead follows the audio clock, not a timer of its own.
  useEffect(() => {
    if (status !== "playing") return;
    const ctx = audioContext();
    if (!ctx) return;
    let frame = 0;
    const tick = () => {
      position.current = (ctx.currentTime - startedAt.current) % length;
      paint(position.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, paint, length]);

  const start = useCallback(
    async (index: number, from?: number, which: ExampleClip | null = clip) => {
      const ctx = audioContext();
      if (!ctx) {
        setStatus("unavailable");
        return;
      }
      setActive(index);
      setStatus((s) => (s === "playing" ? s : "loading"));
      try {
        await ctx.resume();
        let buffer: AudioBuffer;
        try {
          buffer = which
            ? await renderClip(await loadExample(ctx, which.url), variants[index].filters)
            : await render(ctx.sampleRate, variants[index].filters);
        } catch {
          // The song could not be fetched: the synthesised passage still answers the question.
          buffer = await render(ctx.sampleRate, variants[index].filters);
        }
        setShape(peaks(buffer, BINS));
        setLength(buffer.duration);
        stop();
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.loop = true;
        node.connect(output(ctx));
        const offset = ((from ?? position.current) + buffer.duration) % buffer.duration;
        node.start(0, offset);
        startedAt.current = ctx.currentTime - offset;
        position.current = offset;
        source.current = node;
        setStatus("playing");
      } catch {
        setStatus("unavailable");
      }
    },
    [stop, variants, clip],
  );

  const pause = useCallback(() => {
    stop();
    setStatus("paused");
  }, [stop]);

  const scrub = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const seconds = ((event.clientX - rect.left) / rect.width) * length;
    position.current = Math.min(length - 0.01, Math.max(0, seconds));
    paint(position.current);
    if (status === "playing") void start(active, position.current);
  };

  // Another of the listener's songs, through the same two treatments.
  const nextSong = () => {
    const next = (song + 1) % clips.length;
    setSong(next);
    position.current = 0;
    setShape(null);
    if (status === "playing") void start(active, 0, clips[next]);
  };

  if (status === "unavailable") {
    return (
      <p className={cn("text-[12px] text-ink-faint", className)}>
        Your browser wouldn&rsquo;t let us play the example. The question still works without it.
      </p>
    );
  }

  const playing = status === "playing";
  const ab = variants.length > 1;

  return (
    <div className={cn("border-y border-hairline py-3", className)}>
      {clip && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={clip.url}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="flex min-w-0 items-center gap-2 text-[12px] text-ink-muted"
            >
              <Music2 className="size-3.5 shrink-0 text-sun" />
              <span className="truncate">
                <span className="text-ink">{clip.title || "A song from your playlist"}</span>
                <span className="text-ink-faint"> · {MOMENT[clip.question] ?? "from your playlist"}</span>
              </span>
            </motion.p>
          </AnimatePresence>
          {clips.length > 1 && (
            <button
              type="button"
              onClick={nextSong}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink"
            >
              <Shuffle className="size-3" /> Another song
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (playing ? pause() : void start(active))}
          aria-label={playing ? "Pause the example" : "Play the example"}
          className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline-strong text-ink transition-colors duration-300 hover:border-white/35 hover:bg-white/[0.06]"
        >
          {playing ? (
            <Pause className="size-3.5 fill-current" />
          ) : (
            <Play className="size-3.5 translate-x-px fill-current" />
          )}
        </button>

        {/* The waveform of the buffer that is playing, with its playhead. */}
        <button
          type="button"
          onClick={scrub}
          aria-label="Scrub the example"
          className="relative h-7 min-w-0 flex-1 cursor-col-resize overflow-hidden rounded-sm focus-visible:outline-offset-4"
        >
          <span ref={trail} className="absolute inset-y-0 left-0 w-0 bg-white/[0.05]" aria-hidden="true" />
          <span className="absolute inset-0 flex items-center gap-px" aria-hidden="true">
            {(shape ?? Array.from({ length: BINS }, () => 0.14)).map((v, i) => (
              <span
                key={i}
                className={cn("flex-1 rounded-full", shape ? "bg-ink-faint" : "bg-white/8")}
                style={{ height: `${Math.max(5, v * 100)}%` }}
              />
            ))}
          </span>
          <span
            ref={head}
            className="absolute inset-y-0 left-0 w-px bg-ember shadow-[0_0_8px_rgb(255_107_61/0.8)]"
            aria-hidden="true"
          />
        </button>

        {ab && (
          <div className="flex shrink-0 items-center gap-1">
            {variants.map((variant, i) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => void start(i)}
                aria-pressed={i === active}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] whitespace-nowrap transition-colors",
                  i === active ? "bg-white/[0.07] text-ink" : "text-ink-faint hover:text-ink-muted",
                )}
              >
                {variant.label}
                {i === active && playing && <span className="sr-only"> (playing)</span>}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void start(active, 0)}
          aria-label="Play from the start"
          className="grid size-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:text-ink"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        {status === "loading"
          ? "Preparing the example…"
          : clip
            ? "From your own playlist, level-matched. A tonal change through your own headphones — not a simulation of an earphone."
            : ab
              ? "Level-matched. A tonal change through your own headphones — not a simulation of an earphone."
              : "A short reference passage, synthesised here."}
      </p>
    </div>
  );
}
