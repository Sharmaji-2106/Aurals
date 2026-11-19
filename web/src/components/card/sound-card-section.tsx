"use client";

import { engrave, hashNumber, type Engraving } from "@/components/card/artwork";
import {
  commission,
  FINISH_IDS,
  FINISHES,
  rankFinishes,
  type ArtDirection,
  type FinishId,
} from "@/components/card/commission";
import { LISTENERS, library, type Library, type OwnListener } from "@/components/card/listener";
import { Proof } from "@/components/card/proof";
import { signature, traits } from "@/components/card/reading";
import { phases } from "@/components/card/reveal";
import { CardStage } from "@/components/card/scene/card-stage";
import { cn } from "@/lib/cn";
import { quality } from "@/lib/grain/gl";
import { Canvas } from "@react-three/fiber";
import { QrCode, Repeat2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The Sound Card, as the opening section of the listener's page.
 *
 * The card sits on the left as an object in the page: it glides in, its
 * artwork scans on in a second and a half, light passes over it, and it rests
 * — then follows the pointer and turns over when asked. On the right, the card
 * is explained in plain words, part by part, with the listener's own values;
 * and every finish is offered, the one matched to their music marked.
 *
 * Two clocks can drive it. In the edition film, the film's (`time`), so the
 * whole sequence scrubs and replays as one. Anywhere else, its own, started
 * the first time the section comes into view.
 *
 * Whose card it is comes one of two ways: a prepared listener by `slug` (the
 * studios and the edition), or the signed-in listener's own data (`listener`),
 * read live from their music profile, sound profile and ranking.
 */

type Made = { lib: Library; art: ArtDirection; engraving: Engraving; matched: FinishId; codeUrl: string };

const TONAL_PLAIN: Record<string, string> = {
  "Sub-bass": "deep bass",
  "Mid-bass": "bass",
  Warmth: "warmth",
  "Vocal presence": "vocals",
  Treble: "treble",
  Air: "air",
};

/** One sentence on where the listener's line rises and dips. */
function lineSentence(lib: Library) {
  const sig = signature(lib);
  if (!sig.values.length) return "";
  const named = sig.values.map((v, i) => ({
    v,
    name: TONAL_PLAIN[sig.labels[i]] ?? sig.labels[i].toLowerCase(),
  }));
  const hi = [...named].sort((a, b) => b.v - a.v)[0];
  const lo = [...named].sort((a, b) => a.v - b.v)[0];
  if (Math.abs(hi.v) < 0.7 && Math.abs(lo.v) < 0.7)
    return "Yours stays close to typical music all the way across.";
  const parts: string[] = [];
  if (hi.v >= 0.7) parts.push(`rises most in the ${hi.name} (+${hi.v.toFixed(1)} dB)`);
  if (lo.v <= -0.7) parts.push(`dips most in the ${lo.name} (${lo.v.toFixed(1)} dB)`);
  return `Yours ${parts.join(" and ")}.`;
}

export function SoundCardSection({
  slug,
  listener,
  heading = "h2",
  time,
  interactive: interactiveProp,
}: {
  slug?: string;
  listener?: OwnListener;
  /** The card's title is the page's heading when the card leads the page. */
  heading?: "h1" | "h2";
  /** Seconds into the reveal, from the caller's clock; omit to run its own. */
  time?: number;
  interactive?: boolean;
}) {
  const [made, setMade] = useState<Made | null>(null);
  const [choice, setChoice] = useState<FinishId | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [own, setOwn] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [turns, setTurns] = useState(0);
  const section = useRef<HTMLElement>(null);
  const [tier] = useState(() => (typeof window === "undefined" ? "balanced" : quality()));
  // Without WebGL the card is still the card: its flat proof.
  const [webgl] = useState(() => {
    if (typeof document === "undefined") return true;
    try {
      return Boolean(document.createElement("canvas").getContext("webgl2"));
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let live = true;
    const entry = listener ? null : LISTENERS.find((l) => l.slug === slug);
    if (!listener && !entry) return;
    (async () => {
      try {
        const lib = listener
          ? library({ slug: listener.slug, title: listener.title }, listener.snapshot)
          : library(entry!, await entry!.load());
        const matched = rankFinishes(lib)[0];
        const art = commission(lib, choice ?? undefined);
        // Where the code on the back leads: the same address it encodes.
        const codeUrl = listener ? "/card" : `/edition/${slug}`;
        const engraving = await engrave({
          lib,
          art,
          // A listener's own card points to their own card page, which only
          // opens for them: nothing about them is encoded in the code itself.
          editionUrl: `${window.location.origin}${codeUrl}`,
          scanLabel: listener ? ["Scan to open", "your Sound Card"] : undefined,
        });
        if (live) setMade({ lib, art, engraving, matched, codeUrl });
      } catch (error) {
        if (live) setFailure(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      live = false;
    };
  }, [slug, listener, choice]);

  const total = phases().total;
  const external = time !== undefined;

  // Its own clock: started by the section coming into view.
  useEffect(() => {
    if (external || !section.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio > 0.35) setStartedAt((s) => s ?? performance.now());
      },
      { threshold: [0, 0.35, 0.7] },
    );
    observer.observe(section.current);
    return () => observer.disconnect();
  }, [external]);
  useEffect(() => {
    if (external || startedAt === null || !made) return;
    let frame = 0;
    const tick = () => {
      const t = (performance.now() - startedAt) / 1000;
      setOwn(Math.min(t, total));
      if (t < total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [external, startedAt, made, total]);

  // A new finish is engraved afresh: replay the scan, not the arrival. The
  // click's own timestamp is on the same clock as performance.now().
  const pick = (id: FinishId, at: number) => {
    setChoice(id);
    if (!external) setStartedAt(at - 200);
  };

  const t = !webgl ? total : external ? Math.min(time, total) : own;
  const done = t >= total - 0.01;
  const interactive = interactiveProp ?? done;
  const wordsIn = t >= 0.9;

  const lib = made?.lib;
  const art = made?.art;
  const Heading = heading;
  const found = lib ? traits(lib) : [];
  const edition = lib ? `No. ${String(hashNumber(lib.slug, 9000) + 1000)}` : "";
  const top = lib?.top ?? null;

  const appear = (order: number) => ({
    opacity: wordsIn ? 1 : 0,
    transform: wordsIn ? "translateY(0)" : "translateY(12px)",
    transition: `opacity 0.9s cubic-bezier(.2,.7,.2,1) ${order * 0.08}s, transform 0.9s cubic-bezier(.2,.7,.2,1) ${order * 0.08}s`,
  });

  return (
    <section
      ref={section}
      className="relative isolate flex min-h-[calc(100dvh-4rem)] items-center py-12"
      data-section="sound-card"
      data-card-time={t.toFixed(2)}
      data-card-done={done}
      data-card-finish={art?.family ?? ""}
      aria-label={lib ? `Sound Card: ${lib.title}` : "Sound Card"}
    >
      <div className="shell grid w-full grid-cols-[minmax(0,1fr)] items-center gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:items-start">
        {/* The card: an object in the page, toward the left. */}
        <div
          className="relative mx-auto aspect-[4/5] w-full max-w-[420px] touch-pan-y lg:sticky lg:top-24 lg:mx-0 lg:-ml-8 lg:max-h-[calc(100dvh-8rem)] lg:justify-self-start"
          data-card-stage=""
        >
          {made && webgl && (
            <Canvas
              frameloop="demand"
              dpr={tier === "low" ? 1 : 2}
              gl={{
                antialias: true,
                alpha: true,
                premultipliedAlpha: true,
                toneMapping: THREE.NeutralToneMapping,
                toneMappingExposure: 1.08,
              }}
              camera={{ fov: 22, near: 0.01, far: 5, position: [0, 0, 0.25] }}
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
            >
              <CardStage
                engraving={made.engraving}
                art={made.art}
                time={t}
                interactive={interactive}
                turns={turns}
              />
            </Canvas>
          )}
          {made && !webgl && (
            <div className="absolute inset-0 flex items-center justify-center" data-card-proof="">
              <Proof
                engraving={made.engraving}
                art={made.art}
                side="front"
                className="h-[88%] w-auto rounded-[16px]"
              />
            </div>
          )}
          {failure && (
            <p className="absolute inset-x-0 bottom-4 text-center text-[12px] text-ink-faint">{failure}</p>
          )}
        </div>

        {/* The card, explained. */}
        {lib && art && (
          <div className="min-w-0 pb-2">
            <p className="eyebrow" style={appear(0)}>
              Your Sound Card · {edition}
            </p>
            <Heading
              className="font-book-script mt-3 text-[clamp(3rem,5.4vw,5.2rem)] leading-[1.05]"
              style={{
                ...appear(1),
                background: "linear-gradient(100deg, #f1d39b 0%, #ebaa9a 50%, #f2a7b8 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                paddingBottom: "0.08em",
              }}
            >
              {lib.title}
            </Heading>
            <p className="mt-2 max-w-lg text-[16px] leading-relaxed text-ink-muted" style={appear(2)}>
              {listener?.from === "picks"
                ? `A card made from the ${lib.trackCount} songs AURALS chose for the music you named.`
                : listener?.from === "songs"
                  ? `A card made from the ${lib.trackCount} songs you added.`
                  : `A card made from the ${lib.trackCount} songs in this playlist.`}{" "}
              Here&rsquo;s how to read it.
            </p>

            <ol className="mt-7 max-w-xl divide-y divide-hairline border-y border-hairline" style={appear(3)}>
              <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-4">
                <span className="numeric pt-0.5 text-[11px] text-ink-faint">01</span>
                <div>
                  <p className="text-[15px] text-ink">Your sound</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
                    The line shows where this music puts its energy, from bass on the left to treble on the
                    right. Above the dashed line is more than typical music, below is less.{" "}
                    {lineSentence(lib)}
                  </p>
                </div>
              </li>
              <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-4">
                <span className="numeric pt-0.5 text-[11px] text-ink-faint">02</span>
                <div>
                  <p className="text-[15px] text-ink">What stands out</p>
                  <ul className="mt-1.5 flex flex-col gap-1 text-[14px] leading-relaxed text-ink-muted">
                    {found.map((tr) => (
                      <li key={tr.key}>
                        <span className="text-ink">{tr.word}</span> — {tr.note}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
              {top && (
                <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-4">
                  <span className="numeric pt-0.5 text-[11px] text-ink-faint">03</span>
                  <div>
                    <p className="text-[15px] text-ink">Your best match</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
                      The{" "}
                      <span className="text-ink">
                        {top.brand} {top.model}
                      </span>{" "}
                      scores{" "}
                      <span className="text-ink">{top.predicted_preference.mean.toFixed(0)} out of 100</span>{" "}
                      for this sound: the measured earphone whose own line comes closest to it.
                    </p>
                  </div>
                </li>
              )}
            </ol>

            {/* Every finish; the one matched to the music marked. */}
            <div className="mt-6" style={appear(4)}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="text-ink-faint">Card finish</span>
                <span className="text-ink">{art.name}</span>
                <span className="text-ink-faint">
                  {art.family === made.matched ? `— matched to this music: ${art.mood}` : `— for ${art.mood}`}
                </span>
              </p>
              <div className="mt-3 flex max-w-xl flex-wrap gap-2" role="radiogroup" aria-label="Card finish">
                {FINISH_IDS.map((id) => {
                  const f = FINISHES[id];
                  const active = id === art.family;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`${f.name}${id === made.matched ? " (matched to this music)" : ""}`}
                      title={`${f.name} — ${f.mood}`}
                      onClick={(e) => pick(id, e.timeStamp)}
                      disabled={!interactive}
                      className={cn(
                        "relative size-8 rounded-full transition-[transform,box-shadow] duration-300 hover:scale-110 disabled:opacity-50",
                        active
                          ? "shadow-[0_0_0_2px_var(--color-canvas),0_0_0_3.5px_rgb(255_236_222/0.85)]"
                          : "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]",
                      )}
                      style={{
                        background: `radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.55), transparent 42%), linear-gradient(135deg, ${f.palette.base} 0%, ${f.palette.base} 55%, ${f.palette.cut} 56%, ${f.palette.cut} 70%, ${f.palette.base} 71%)`,
                      }}
                    >
                      {id === made.matched && (
                        <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-sun shadow-[0_0_0_2px_var(--color-canvas)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {webgl && (
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2" style={appear(5)}>
                <button
                  type="button"
                  onClick={() => setTurns((n) => n + 1)}
                  disabled={!interactive}
                  className="flex h-10 items-center gap-2 rounded-full px-4 text-[13px] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)] transition-[background-color,box-shadow] duration-500 hover:bg-white/[0.05] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.3)] disabled:opacity-40"
                >
                  <Repeat2 className="size-4" /> Turn it over
                </button>
                <a
                  href={made.codeUrl}
                  target="_blank"
                  rel="noopener"
                  title="Opens the address the code on the back of the card leads to"
                  className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] transition-[background-color,color,box-shadow] duration-500 hover:bg-white/[0.05] hover:text-ink hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.26)]"
                >
                  <QrCode className="size-3.5" /> Open the code
                </a>
                <span className="text-[12px] text-ink-faint">
                  {listener
                    ? "or drag the card — the back has your top artist and a code that opens your card"
                    : "or drag the card — the back has your top artist and the code for your Edition"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
