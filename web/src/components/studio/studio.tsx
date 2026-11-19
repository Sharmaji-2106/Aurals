"use client";

import { cn } from "@/lib/cn";
import { Maximize2, Pause, Play, RotateCcw, Rows2, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONCEPTS, conceptById, type Concept } from "./concepts";
import { STAGES, Sequence, clamp, stageAt } from "./sequence";

const SPEEDS = [0.25, 0.5, 1] as const;

export function MotionStudio() {
  const reduced = useReducedMotion();
  const [seq] = useState(() => new Sequence());
  const [activeId, setActiveId] = useState(CONCEPTS[0].id);
  const [compareId, setCompareId] = useState(CONCEPTS[2].id);
  const [comparing, setComparing] = useState(false);
  const [theatre, setTheatre] = useState(false);
  // The clock's state is mirrored into React state rather than read off the
  // instance: the compiler memoises on prop identity, and `seq` never changes
  // identity, so a control reading `seq.playing` directly would never redraw.
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [variant, setVariant] = useState<string | undefined>(undefined);

  useEffect(() => {
    const off = seq.onState(() => {
      setPlaying(seq.playing);
      setSpeed(seq.speed);
    });
    return () => {
      off();
      seq.dispose();
    };
  }, [seq]);

  // A new concept starts from the top. Under reduced motion it is parked at a
  // representative frame instead, and the viewer can still press play.
  useEffect(() => {
    if (reduced) seq.seek(0.74);
    else seq.replay();
  }, [seq, activeId, compareId, comparing, reduced, variant]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape" && theatre) setTheatre(false);
      if (e.key === " ") {
        e.preventDefault();
        seq.toggle();
      }
      if (e.key.toLowerCase() === "r") seq.replay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seq, theatre]);

  const active = conceptById(activeId);
  const compare = conceptById(compareId);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Masthead />

      <main className="mx-auto flex w-full max-w-[112rem] flex-1 flex-col gap-10 px-5 pt-8 pb-16 sm:px-8 lg:flex-row lg:gap-14 lg:pt-12">
        <Index
          active={activeId}
          comparing={comparing}
          compareId={compareId}
          onPick={(id) => {
            setActiveId(id);
            setVariant(undefined);
          }}
          onPickCompare={setCompareId}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className={cn("grid gap-4", comparing && "md:grid-cols-2")}>
            <Stage
              seq={seq}
              concept={active}
              variant={variant ?? active.variants?.[0]?.id}
              reduced={!!reduced}
              label={comparing ? "A" : undefined}
            />
            {comparing && <Stage seq={seq} concept={compare} reduced={!!reduced} label="B" />}
          </div>

          <Transport
            seq={seq}
            playing={playing}
            speed={speed}
            variants={active.variants}
            variantLabel={active.variantLabel}
            variant={variant ?? active.variants?.[0]?.id}
            onVariant={setVariant}
            reduced={!!reduced}
            comparing={comparing}
            onCompare={() => setComparing((v) => !v)}
            onTheatre={() => setTheatre(true)}
          />

          <Notes concept={active} compare={comparing ? compare : null} />
        </div>
      </main>

      {theatre && (
        <Theatre
          seq={seq}
          concept={active}
          variant={variant ?? active.variants?.[0]?.id}
          playing={playing}
          reduced={!!reduced}
          onClose={() => setTheatre(false)}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- chrome --- */

function Masthead() {
  return (
    <header className="border-b border-hairline">
      <div className="mx-auto flex w-full max-w-[112rem] items-baseline justify-between gap-6 px-5 py-5 sm:px-8">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-[15px] tracking-tight text-ink">AURALS</span>
          <span className="font-mono text-[10px] tracking-[0.34em] text-ink-faint uppercase">
            Motion Studio
          </span>
        </div>
        <p className="hidden font-mono text-[10px] tracking-[0.22em] text-ink-faint uppercase sm:block">
          Playlist entry · five directions · not in production
        </p>
      </div>
    </header>
  );
}

function Index({
  active,
  comparing,
  compareId,
  onPick,
  onPickCompare,
}: {
  active: string;
  comparing: boolean;
  compareId: string;
  onPick: (id: string) => void;
  onPickCompare: (id: string) => void;
}) {
  return (
    <nav className="shrink-0 lg:w-[20rem]" aria-label="Concepts">
      <ol className="flex gap-x-6 gap-y-0 overflow-x-auto pb-2 lg:block lg:overflow-visible lg:pb-0">
        {CONCEPTS.map((concept) => {
          const on = concept.id === active;
          const asB = comparing && concept.id === compareId;
          return (
            <li key={concept.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onPick(concept.id)}
                onDoubleClick={() => onPickCompare(concept.id)}
                aria-current={on ? "true" : undefined}
                className="group relative block w-full py-3 text-left lg:py-4"
              >
                <span
                  className={cn(
                    "absolute top-0 -left-5 h-full w-px transition-colors duration-500 lg:block",
                    on ? "bg-ember" : "bg-transparent",
                  )}
                  aria-hidden="true"
                />
                <span className="flex items-baseline gap-3">
                  <span
                    className={cn(
                      "font-mono text-[10px] tracking-[0.2em] transition-colors duration-300",
                      on ? "text-ember" : "text-ink-faint group-hover:text-ink-muted",
                    )}
                  >
                    {concept.index}
                  </span>
                  <span
                    className={cn(
                      "font-display text-[19px] leading-tight whitespace-nowrap transition-colors duration-300 lg:whitespace-normal",
                      on ? "text-ink" : "text-ink-muted group-hover:text-ink",
                    )}
                  >
                    {concept.title}
                  </span>
                  {asB && <span className="font-mono text-[9px] tracking-[0.2em] text-ink-faint">B</span>}
                </span>
                <span
                  className={cn(
                    "mt-1.5 hidden max-w-[17rem] text-[12px] leading-relaxed transition-all duration-500 lg:block",
                    on ? "text-ink-muted opacity-100" : "text-ink-faint opacity-0",
                  )}
                >
                  {on ? concept.line : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 hidden font-mono text-[10px] leading-relaxed tracking-[0.14em] text-ink-faint uppercase lg:block">
        Space plays · R replays · double-click sets B
      </p>
    </nav>
  );
}

/* ---------------------------------------------------------------- stage --- */

function Stage({
  seq,
  concept,
  variant,
  reduced,
  label,
  tall = false,
}: {
  seq: Sequence;
  concept: Concept;
  variant?: string;
  reduced: boolean;
  label?: string;
  tall?: boolean;
}) {
  const { Scene } = concept;
  return (
    <figure className="relative m-0 min-w-0">
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-[#060607]",
          tall ? "h-full" : "aspect-[16/10]",
        )}
        style={{
          // A room, not a card: light falls off from above rather than a border.
          backgroundImage: "radial-gradient(120% 90% at 50% -10%, rgb(255 255 255 / 0.045), transparent 60%)",
          boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.05), 0 40px 120px -60px rgb(0 0 0 / 1)",
        }}
      >
        {/* Remount per concept, so a GPU context is never left behind. */}
        <Scene key={`${concept.id}:${variant ?? ""}`} seq={seq} variant={variant} />
        {label && (
          <span className="absolute top-3 left-4 font-mono text-[10px] tracking-[0.3em] text-ink-faint">
            {label}
          </span>
        )}
        {reduced && (
          <p className="absolute right-4 bottom-3 left-4 text-center font-mono text-[10px] tracking-[0.2em] text-ink-faint uppercase">
            Reduced motion · held at transition · press play to run it
          </p>
        )}
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------ transport --- */

function Transport({
  seq,
  playing,
  speed,
  variants,
  variantLabel,
  variant,
  onVariant,
  reduced,
  comparing,
  onCompare,
  onTheatre,
}: {
  seq: Sequence;
  playing: boolean;
  speed: number;
  variants?: { readonly id: string; readonly label: string }[];
  variantLabel?: string;
  variant?: string;
  onVariant: (id: string) => void;
  reduced: boolean;
  comparing: boolean;
  onCompare: () => void;
  onTheatre: () => void;
}) {
  return (
    <div className="mt-5">
      <Timeline seq={seq} />
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-1">
          <IconButton onClick={() => seq.toggle()} label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </IconButton>
          <IconButton onClick={() => seq.replay()} label="Replay from the start">
            <RotateCcw className="size-3.5" />
          </IconButton>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint uppercase">Rate</span>
          <div className="flex items-center gap-1">
            {SPEEDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => seq.setSpeed(option)}
                className={cn(
                  "numeric rounded-full px-2.5 py-1 text-[11px] transition-colors",
                  speed === option ? "bg-white/[0.08] text-ink" : "text-ink-faint hover:text-ink-muted",
                )}
              >
                {option}&times;
              </button>
            ))}
          </div>
        </div>

        {variants && variants.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.22em] text-ink-faint uppercase">
              {variantLabel ?? "Variant"}
            </span>
            <div className="flex items-center gap-1">
              {variants.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onVariant(option.id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                    variant === option.id
                      ? "bg-white/[0.08] text-ink"
                      : "text-ink-faint hover:text-ink-muted",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <TextButton onClick={onCompare} on={comparing}>
            <Rows2 className="size-3.5" /> Compare
          </TextButton>
          <TextButton onClick={onTheatre}>
            <Maximize2 className="size-3.5" /> Theatre
          </TextButton>
        </div>
      </div>
      {reduced && (
        <p className="mt-3 text-[12px] text-ink-faint">
          Your system asks for reduced motion, so nothing plays on its own here.
        </p>
      )}
    </div>
  );
}

function Timeline({ seq }: { seq: Sequence }) {
  const track = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const dragging = useRef(false);

  useEffect(
    () =>
      seq.watch((t) => {
        if (head.current) head.current.style.transform = `translateX(${t * 100}cqw)`;
        if (fill.current) fill.current.style.transform = `scaleX(${t})`;
        const percent = String(Math.round(t * 100));
        if (track.current && track.current.getAttribute("aria-valuenow") !== percent) {
          track.current.setAttribute("aria-valuenow", percent);
        }
        const current = stageAt(t);
        STAGES.forEach((stage, i) => {
          const node = labels.current[i];
          if (node) node.style.color = stage.key === current ? "#eeebe5" : "";
        });
      }),
    [seq],
  );

  const seekFrom = useCallback(
    (clientX: number) => {
      const el = track.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      seq.seek(clamp((clientX - rect.left) / rect.width));
    },
    [seq],
  );

  return (
    <div className="select-none" style={{ containerType: "inline-size" }}>
      <div className="flex justify-between">
        {STAGES.map((stage, i) => (
          <span
            key={stage.key}
            ref={(el) => {
              labels.current[i] = el;
            }}
            className="font-mono text-[9px] tracking-[0.22em] text-ink-faint uppercase transition-colors duration-300"
          >
            {stage.label}
          </span>
        ))}
      </div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Sequence position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seq.seek(seq.t + 0.02);
          if (e.key === "ArrowLeft") seq.seek(seq.t - 0.02);
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seq.pause();
          seekFrom(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && seekFrom(e.clientX)}
        onPointerUp={() => {
          dragging.current = false;
        }}
        className="relative mt-2.5 cursor-ew-resize py-3"
      >
        <div className="h-px w-full bg-hairline-strong" />
        <div
          ref={fill}
          className="absolute inset-x-0 top-1/2 h-px origin-left bg-linear-to-r from-ember via-band-mids to-band-air"
          style={{ transform: "scaleX(0)" }}
        />
        {STAGES.map((stage) => (
          <span
            key={stage.key}
            className="absolute top-1/2 size-[3px] -translate-y-1/2 rounded-full bg-white/25"
            style={{ left: `${stage.at * 100}%` }}
            aria-hidden="true"
          />
        ))}
        <div
          ref={head}
          className="pointer-events-none absolute top-1/2 -ml-[3px] size-1.5 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_14px_2px_rgb(255_107_61/0.45)]"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
    >
      {children}
    </button>
  );
}

function TextButton({
  onClick,
  on,
  children,
}: {
  onClick: () => void;
  on?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] transition-colors",
        on ? "bg-white/[0.08] text-ink" : "text-ink-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- notes --- */

function Notes({ concept, compare }: { concept: Concept; compare: Concept | null }) {
  return (
    <div className="mt-10 grid gap-8 border-t border-hairline pt-7 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div>
        <p className="font-mono text-[10px] tracking-[0.3em] text-ink-faint uppercase">
          {concept.index} — {concept.title}
          {compare && ` · against ${compare.index} ${compare.title}`}
        </p>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{concept.line}</p>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-faint">{concept.note}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 self-start text-[12px] sm:grid-cols-1">
        <div>
          <dt className="font-mono text-[9px] tracking-[0.24em] text-ink-faint uppercase">Rendering</dt>
          <dd className="mt-1 text-ink-muted">{concept.technique}</dd>
        </div>
        <div>
          <dt className="font-mono text-[9px] tracking-[0.24em] text-ink-faint uppercase">Headphones</dt>
          <dd className="mt-1 text-ink-muted">{concept.headphones}</dd>
        </div>
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------- theatre --- */

function Theatre({
  seq,
  concept,
  variant,
  playing,
  reduced,
  onClose,
}: {
  seq: Sequence;
  concept: Concept;
  variant?: string;
  playing: boolean;
  reduced: boolean;
  onClose: () => void;
}) {
  const { Scene } = concept;
  const [quiet, setQuiet] = useState(false);

  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setQuiet(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setQuiet(true), 2200);
    };
    wake();
    window.addEventListener("pointermove", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#050506]">
      <div className="absolute inset-0">
        <Scene key={`theatre-${concept.id}:${variant ?? ""}`} seq={seq} variant={variant} />
      </div>
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center justify-between gap-6 px-7 pb-7 transition-opacity duration-700",
          quiet && !reduced ? "opacity-0" : "opacity-100",
        )}
      >
        <p className="font-mono text-[10px] tracking-[0.3em] text-ink-faint uppercase">
          {concept.index} — {concept.title}
        </p>
        <div className="flex items-center gap-1">
          <IconButton onClick={() => seq.toggle()} label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </IconButton>
          <IconButton onClick={() => seq.replay()} label="Replay">
            <RotateCcw className="size-3.5" />
          </IconButton>
          <IconButton onClick={onClose} label="Close theatre">
            <X className="size-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
