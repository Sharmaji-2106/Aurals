"use client";

import {
  LABEL,
  means,
  nextTrial,
  probitUpdate,
  start,
  TONAL,
  TRIALS,
  zeros,
  type Belief,
  type Offsets,
  type Picked,
  type Tonal,
  type Trial,
} from "@/components/tuning/adaptive";
import { loadClip, TuningPlayer, type Side } from "@/components/tuning/player";
import { SongStudio, type ChosenPart } from "@/components/tuning/song-studio";
import { LiveCurve, MiniCurve, useLevel } from "@/components/tuning/visuals";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import type { TuningDevice, TuningSession, TuningShape } from "@/lib/api/hooks";
import {
  useDeviceDetail,
  usePopularDevices,
  useQuestionExamples,
  useSubmitTuning,
  useTuningClip,
  useTuningDevices,
  useTuningShapes,
} from "@/lib/api/hooks";
import { audioContext } from "@/lib/audio/engine";
import { cn } from "@/lib/cn";
import { ArrowRight, Check, Headphones, Music2, Pause, Play, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VolumeRail } from "@/components/listen/volume";

/**
 * The listening session, before the questions: your ears decide first.
 *
 * 1. **Set up**: headphones on, and what they are — so choices made through them
 *    can be turned into an absolute sound (see `tuning/devices.py`).
 * 2. **Shapes**: the best 20 seconds of the most-watched song in your playlist,
 *    played live in each of the shapes reviewers talk about — V, U, warm, bright…
 *    — "which of these sounds like you?"
 * 3. **The duel**: eight blind A/B pairs of that clip, each differing in one region,
 *    chosen adaptively; one repeats unannounced, to measure your consistency.
 * 4. **What we heard**: your line, as your choices drew it.
 *
 * Everything is level-matched, so nothing wins by being louder. The backend
 * recomputes the result from the raw choices and weighs it against your music and
 * answers by how much each can be trusted.
 */

type Stage = "setup" | "shapes" | "duel" | "result";
type Device = {
  kind: "catalogue" | "earbuds" | "over_ear" | "unknown";
  slug?: string;
  label?: string;
  image?: string | null;
  comparable?: boolean;
  headphones?: boolean;
};
type Record_ = {
  dimension: Tonal;
  center_db: number;
  delta_db: number;
  picked: Picked;
  repeat_of: number | null;
};

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Each comparison played on the song from the listener's playlist that shows it
 * off best: the questionnaire's examples (see `tuning/examples.py`) are cut for
 * exactly this — the heaviest low end for bass, the most forward voice for
 * vocals, the brightest stretch for treble. The song illustrates the question;
 * the choice is recorded the same way whichever song played.
 */
const SONG_FOR: Record<Tonal, string[]> = {
  sub_bass: ["bass_amount", "bass_character"],
  mid_bass: ["bass_character", "bass_amount"],
  warmth: ["tone", "bass_character"],
  vocal_presence: ["vocals", "tone"],
  treble: ["treble_feel", "tone"],
  air: ["treble_feel", "tone"],
};
const SONG_WHY: Record<string, string> = {
  bass_amount: "the heaviest low end in your playlist",
  bass_character: "a bass-led song from your playlist",
  vocals: "the most forward vocal in your playlist",
  treble_feel: "the brightest song in your playlist",
  tone: "a full, busy stretch of your playlist",
};
type Song = { key: string; url: string; title: string; artist: string; why: string };

export function TuningFlow({
  onDone,
  onSkip,
  onStart,
}: {
  onDone: () => void;
  onSkip: () => void;
  /** The session has begun: the host keeps showing it, even once a result is saved. */
  onStart?: () => void;
}) {
  const shapes = useTuningShapes();
  const clip = useTuningClip();
  const submit = useSubmitTuning();
  const [stage, setStage] = useState<Stage>("setup");
  const [device, setDevice] = useState<Device>({ kind: "unknown" });
  const [player, setPlayer] = useState<TuningPlayer | null>(null);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [shape, setShape] = useState<string | null>("balanced");
  const [auditioned, setAuditioned] = useState<Set<string>>(() => new Set(["balanced"]));
  const [beliefs, setBeliefs] = useState<Record<Tonal, Belief> | null>(null);
  const [history, setHistory] = useState<Trial[]>([]);
  const [records, setRecords] = useState<Record_[]>([]);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [aIsPlus, setAIsPlus] = useState(true);
  const [heard, setHeard] = useState<Side>("a");
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<TuningSession | null>(null);
  // The listener's own song and part, when they chose one over the suggested clip.
  const [custom, setCustom] = useState<ChosenPart | null>(null);
  const [studio, setStudio] = useState(false);
  const songTitle = custom?.title ?? clip.data?.title ?? null;
  // Songs matched to each question, from the listener's own playlist.
  const examples = useQuestionExamples();
  const [matchSongs, setMatchSongs] = useState(true);
  const [nowSong, setNowSong] = useState<Song | null>(null);
  const [heardSongs, setHeardSongs] = useState<string[]>([]);
  const base = useRef<AudioBuffer | null>(null);
  const decoded = useRef(new Map<string, Promise<AudioBuffer>>());
  const songs = new Map(
    (examples.data?.status === "ready" ? examples.data.items : []).map((e) => [
      e.question,
      {
        key: e.question,
        url: e.audio_url,
        title: e.title,
        artist: e.artist,
        why: SONG_WHY[e.question] ?? "",
      },
    ]),
  );
  const matching = matchSongs && !custom && songs.size > 0;
  const songFor = (d: Tonal): Song | null => {
    for (const q of SONG_FOR[d]) {
      const s = songs.get(q);
      if (s) return s;
    }
    return null;
  };
  const decode = (url: string) => {
    let job = decoded.current.get(url);
    if (!job && player) {
      job = loadClip(player.ctx, url);
      decoded.current.set(url, job);
    }
    return job ?? Promise.reject(new Error("no player"));
  };

  useEffect(() => () => player?.dispose(), [player]);
  // The volume rail breathes with whatever is playing.
  const rail = useRef<HTMLDivElement>(null);
  useLevel(player, rail, playing);

  const shapeOffsets = useCallback(
    (key: string | null): Offsets => {
      const s = shapes.data?.find((x) => x.key === key);
      return s ? ({ ...zeros(), ...s.offsets } as Offsets) : zeros();
    },
    [shapes.data],
  );

  // The clip may take a few seconds to prepare; it starts loading on arrival.
  const begin = async () => {
    const ctx = audioContext();
    if (!ctx) {
      setFailure("This browser cannot play audio here.");
      return;
    }
    setStarting(true);
    onStart?.();
    try {
      const p = new TuningPlayer(ctx);
      const url = clip.data?.status === "ready" ? (clip.data.audio_url ?? null) : null;
      base.current = custom ? custom.buffer : await loadClip(ctx, url);
      await p.load(base.current);
      await p.setTuning("a", shapeOffsets("balanced"));
      p.listen("a");
      p.play();
      setPlayer(p);
      setPlaying(true);
      setStage("shapes");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  };

  const audition = (key: string) => {
    setShape(key);
    setAuditioned((s) => new Set(s).add(key));
    void player?.setTuning("a", shapeOffsets(key));
    if (player && !player.playing) {
      player.play();
      setPlaying(true);
    }
  };

  const toggle = () => {
    if (!player) return;
    if (player.playing) player.stop();
    else player.play();
    setPlaying(player.playing);
  };

  // A trial: both sides at the current best guess, one region moved up or down —
  // on the song that shows that region off, when songs are being matched.
  const presenting = useRef(0);
  const [preparing, setPreparing] = useState(false);
  const present = async (
    t: Trial,
    b: Record<Tonal, Belief>,
    song: Song | null = matching ? songFor(t.dimension) : null,
  ) => {
    if (!player) return;
    const mine = ++presenting.current;
    // No answers while the next pair is being prepared: a choice is always
    // read against the pair that is actually playing.
    setPreparing(true);
    try {
      const want = song ? await decode(song.url) : base.current;
      if (mine !== presenting.current) return; // a newer pair took over
      if (want && player.loaded !== want) await player.load(want);
      setNowSong(song);
      if (song) setHeardSongs((h) => (h.includes(song.title) ? h : [...h, song.title]));
    } catch {
      // The matched song could not be played: stay on the one already loaded.
      setNowSong(null);
    }
    if (mine !== presenting.current) return;
    const current = means(b);
    const plus = { ...current, [t.dimension]: t.center_db + t.delta_db };
    const minus = { ...current, [t.dimension]: t.center_db - t.delta_db };
    const flip = Math.random() < 0.5;
    setAIsPlus(flip);
    await Promise.all([
      player.setTuning("a", flip ? plus : minus),
      player.setTuning("b", flip ? minus : plus),
    ]);
    if (mine !== presenting.current) return;
    setPreparing(false);
    player.listen("a");
    setHeard("a");
    if (!player.playing) {
      player.play();
      setPlaying(true);
    }
  };

  const startDuel = () => {
    const b = start(shape ? shapeOffsets(shape) : null);
    const first = nextTrial(b, []);
    setBeliefs(b);
    setHistory([]);
    setRecords([]);
    setHeardSongs([]);
    setTrial(first);
    setStage("duel");
    if (first) void present(first, b);
  };

  // Matching switched on or off mid-duel: the pair in hand moves song at once.
  const toggleMatching = () => {
    const next = !matching;
    setMatchSongs(next);
    if (next) setCustom(null); // matching again: the listener's own song steps aside
    if (stage === "duel" && trial && beliefs) {
      void present(trial, beliefs, next ? songFor(trial.dimension) : null);
    }
  };

  const listen = (side: Side) => {
    player?.listen(side);
    setHeard(side);
  };

  const choose = (choice: "a" | "b" | "same") => {
    if (!trial || !beliefs || preparing) return;
    const picked: Picked = choice === "same" ? "same" : (choice === "a") === aIsPlus ? "plus" : "minus";
    const updated = {
      ...beliefs,
      [trial.dimension]: probitUpdate(beliefs[trial.dimension], trial.center_db, trial.delta_db, picked),
    };
    const nextHistory = [...history, trial];
    const nextRecords = [...records, { ...trial, picked }];
    setBeliefs(updated);
    setHistory(nextHistory);
    setRecords(nextRecords);
    const following = nextTrial(updated, nextHistory);
    setTrial(following);
    if (following) void present(following, updated);
    else finish(nextRecords, updated);
  };

  const finish = (all: Record_[], b: Record<Tonal, Belief>) => {
    void player?.setTuning("a", means(b));
    player?.listen("a");
    setHeard("a");
    setStage("result");
    submit.mutate(
      {
        shape,
        device_kind: device.kind,
        device_slug: device.slug ?? null,
        // Which songs the choices were made on: the record says, either way.
        clip_title: heardSongs.length
          ? `Matched to each question: ${heardSongs.join(" · ")}`.slice(0, 300)
          : songTitle,
        choices: all,
      },
      { onSuccess: (session) => setResult(session) },
    );
  };

  const leave = (then: () => void) => {
    player?.stop();
    then();
  };

  // Keyboard: ← → to switch sides, 1 / 2 / 3 to choose.
  useEffect(() => {
    if (stage !== "duel") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") listen("a");
      if (e.key === "ArrowRight") listen("b");
      if (e.key === "1") choose("a");
      if (e.key === "2") choose("same");
      if (e.key === "3") choose("b");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A song chosen mid-session replaces the one playing: in the duel, for every
  // pair from here on (matching steps aside); before it, at the shape being heard.
  const playOwn = async (part: ChosenPart) => {
    setCustom(part);
    setStudio(false);
    base.current = part.buffer;
    if (!player) return;
    if (stage === "duel" && trial && beliefs) {
      await present(trial, beliefs, null);
      return;
    }
    await player.load(part.buffer);
    await player.setTuning("a", shapeOffsets(shape));
    player.listen("a");
    player.play();
    setPlaying(true);
  };

  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100dvh-9rem)] flex-col py-6",
        // Room for the volume rail on the right edge.
        stage !== "setup" && "sm:pr-20",
      )}
      data-tuning-stage={stage}
    >
      {player && stage !== "setup" && <VolumeRail meter={rail} />}
      <AnimatePresence>
        {studio && <SongStudio onUse={(part) => void playOwn(part)} onClose={() => setStudio(false)} />}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {stage === "setup" && (
          <motion.section
            key="setup"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24, filter: "blur(6px)" }}
            transition={{ duration: 0.8, ease }}
            className="grid flex-1 items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
          >
            <div>
              <p className="eyebrow eyebrow-rule">Before the questions · listen</p>
              <h1 className="marquee mt-6 text-[clamp(2.8rem,6vw,5.6rem)]">
                Let your <em className="voice text-sunset">ears</em> decide.
              </h1>
              <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-ink-muted">
                You&rsquo;ll hear your music in different tunings and pick what sounds best — each comparison
                on the song from your playlist that shows it off, or on one song of your choosing. About
                ninety seconds. Every version is matched in loudness, so only the sound itself can win.
              </p>
              <ClipCard
                clip={clip.data}
                loading={clip.isPending && !custom}
                custom={custom}
                onChoose={() => setStudio(true)}
              />
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={begin} loading={starting} disabled={clip.isPending}>
                  <Headphones className="size-4" /> I&rsquo;m wearing headphones — start
                </Button>
                <Button size="lg" variant="ghost" onClick={() => leave(onSkip)}>
                  Skip to the questions
                </Button>
              </div>
              {failure && <ErrorNote className="mt-4">{failure}</ErrorNote>}
            </div>
            <DevicePicker device={device} onChange={setDevice} />
          </motion.section>
        )}

        {stage === "shapes" && shapes.data && (
          <motion.section
            key="shapes"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24, filter: "blur(6px)" }}
            transition={{ duration: 0.8, ease }}
            className="flex flex-1 flex-col"
          >
            <StageHead
              step="1 of 2"
              title={
                <>
                  Which of these sounds like <em className="voice text-sunset">you</em>?
                </>
              }
              note="Tap a shape to hear it. These are the words reviewers use; here each one is an exact curve."
              player={player}
              playing={playing}
              onToggle={toggle}
              clipTitle={songTitle}
              onChangeSong={() => setStudio(true)}
            />
            <div className="relative mt-6">
              <LiveCurve offsets={shapeOffsets(shape)} className="h-[min(26vh,240px)] w-full" />
            </div>
            <div
              className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
              role="radiogroup"
              aria-label="Sound shape"
            >
              {shapes.data.map((s, i) => (
                <ShapeCard
                  key={s.key}
                  shape={s}
                  active={shape === s.key}
                  order={i}
                  onClick={() => audition(s.key)}
                />
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={startDuel} disabled={auditioned.size < 2}>
                {shape ? (
                  <>
                    {shapes.data.find((s) => s.key === shape)?.label} is closest{" "}
                    <ArrowRight className="size-4" />
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={() => {
                  setShape(null);
                  startDuel();
                }}
              >
                Not sure — let the comparisons decide
              </Button>
              {auditioned.size < 2 && (
                <span className="text-[12px] text-ink-faint">Listen to at least two first.</span>
              )}
            </div>
          </motion.section>
        )}

        {stage === "duel" && trial && beliefs && (
          <motion.section
            key="duel"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24, filter: "blur(6px)" }}
            transition={{ duration: 0.8, ease }}
            className="flex flex-1 flex-col"
          >
            <StageHead
              step="2 of 2"
              title={
                <>
                  Which sounds <em className="voice text-sunset">better</em>?
                </>
              }
              note="Same song, two tunings. Switch between A and B as often as you like — or use ← and →."
              player={player}
              playing={playing}
              onToggle={toggle}
              clipTitle={nowSong?.title ?? songTitle}
              onChangeSong={() => setStudio(true)}
            />
            <SongLine
              song={nowSong}
              custom={custom?.title ?? null}
              available={songs.size > 0}
              preparing={examples.data?.status === "preparing"}
              matching={matching}
              onToggle={toggleMatching}
            />
            <Progress done={history.length} />
            <AnimatePresence mode="wait">
              <motion.div
                key={history.length}
                initial={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 1.03, filter: "blur(8px)" }}
                transition={{ duration: 0.55, ease }}
                className="mt-8 grid flex-1 grid-cols-2 items-center gap-4 sm:gap-10"
              >
                <Pad side="a" heard={heard === "a"} player={player} onListen={() => listen("a")} />
                <Pad side="b" heard={heard === "b"} player={player} onListen={() => listen("b")} />
              </motion.div>
            </AnimatePresence>
            <p className="mt-6 text-center text-[13px] text-ink-faint">
              This pair changes the <span className="text-ink-muted">{LABEL[trial.dimension]}</span>.
            </p>
            <div className="mx-auto mt-5 grid w-full max-w-xl grid-cols-3 gap-3">
              <Button size="lg" variant="secondary" onClick={() => choose("a")} disabled={preparing}>
                A is better
              </Button>
              <Button size="lg" variant="ghost" onClick={() => choose("same")} disabled={preparing}>
                Can&rsquo;t tell
              </Button>
              <Button size="lg" variant="secondary" onClick={() => choose("b")} disabled={preparing}>
                B is better
              </Button>
            </div>
          </motion.section>
        )}

        {stage === "result" && beliefs && (
          <motion.section
            key="result"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease }}
            className="flex flex-1 flex-col"
          >
            <p className="eyebrow eyebrow-rule">What we heard</p>
            <h1 className="marquee mt-5 text-[clamp(2.6rem,5.4vw,5rem)]">
              This is <em className="voice text-sunset">your</em> sound, by ear.
            </h1>
            <div className="relative mt-6">
              <LiveCurve
                offsets={means(beliefs)}
                band={{
                  lower: Object.fromEntries(
                    TONAL.map((d) => [d, beliefs[d].mean - 1.28 * Math.sqrt(beliefs[d].var)]),
                  ) as Offsets,
                  upper: Object.fromEntries(
                    TONAL.map((d) => [d, beliefs[d].mean + 1.28 * Math.sqrt(beliefs[d].var)]),
                  ) as Offsets,
                }}
                className="h-[min(30vh,280px)] w-full"
              />
            </div>
            <ResultWords beliefs={beliefs} session={result} pending={submit.isPending} />
            {submit.error && <ErrorNote className="mt-4">{submit.error.message}</ErrorNote>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => leave(onDone)} disabled={submit.isPending}>
                Continue to a few questions <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="ghost" onClick={startDuel}>
                Listen again
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------- parts --- */

function ClipCard({
  clip,
  loading,
  custom,
  onChoose,
}: {
  clip: { status: string; title?: string | null; artist?: string | null } | undefined;
  loading: boolean;
  custom: ChosenPart | null;
  onChoose: () => void;
}) {
  const at = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className="mt-8 max-w-lg">
      <div className="glass flex items-center gap-4 rounded-2xl px-5 py-4">
        <div className="flex h-10 items-end gap-[3px]" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-linear-to-t from-coral to-sun"
              style={{
                height: "100%",
                animation: `eq-bar ${1.1 + (i % 3) * 0.2}s ${i * 0.09}s ease-in-out infinite alternate`,
                opacity: loading ? 0.5 : 1,
              }}
            />
          ))}
        </div>
        <div className="min-w-0 text-[14px]">
          {custom ? (
            <>
              <p className="truncate text-ink">{custom.title}</p>
              <p className="truncate text-[12px] text-ink-faint">
                Your choice · {at(custom.start)}–{at(custom.start + 20)}
              </p>
            </>
          ) : loading ? (
            <p className="text-ink-muted">Finding the best 20 seconds of your most-played song…</p>
          ) : clip?.status === "ready" ? (
            <>
              <p className="truncate text-ink">{clip.title}</p>
              <p className="truncate text-[12px] text-ink-faint">
                {clip.artist} · its strongest 20 seconds, from your playlist
              </p>
            </>
          ) : (
            <p className="text-ink-muted">
              No playlist yet, so a short built-in track will play. Add music for a song you know.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onChoose}
        className="group mt-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        <Music2 className="size-4 text-sun transition-transform duration-500 group-hover:rotate-12" />
        {custom ? "Choose a different song or part" : "Play your own song — any part of it"}
      </button>
    </div>
  );
}

/** A device's photograph, small, on a soft sweep; its initials where there is none. */
function DeviceThumb({
  image,
  label,
  className,
}: {
  image?: string | null;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(120%_90%_at_50%_0%,#f6f2ec,#ddd6cc)]",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/iem-images/${image}`}
          alt=""
          loading="lazy"
          className="size-full object-contain p-[12%] mix-blend-multiply"
        />
      ) : (
        <span className="text-[11px] font-medium tracking-wide text-[#5d5460]">
          {label
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0])
            .join("")}
        </span>
      )}
    </span>
  );
}

/** How the device already sounds, in words: its two largest leanings against the target. */
function leanings(offsets: Partial<Record<Tonal, number>>) {
  const big = TONAL.map((d) => ({ d, v: offsets[d] ?? 0 }))
    .filter((x) => Math.abs(x.v) >= 1)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 2)
    .map(
      ({ d, v }) =>
        `${v > 0 ? "more" : "less"} ${LABEL[d]} (${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} dB)`,
    );
  return big.length
    ? `They already have ${big.join(" and ")} than neutral.`
    : "They already sound close to neutral.";
}

function DevicePicker({ device, onChange }: { device: Device; onChange: (d: Device) => void }) {
  const [q, setQ] = useState("");
  const [shelf, setShelf] = useState<"earphones" | "headphones">("earphones");
  const found = useTuningDevices(q);
  const popular = usePopularDevices(shelf === "headphones");
  const detail = useDeviceDetail(device.kind === "catalogue" ? device.slug : null);
  const pick = (d: TuningDevice) => {
    onChange({
      kind: "catalogue",
      slug: d.slug,
      label: d.label,
      image: d.image_path,
      comparable: d.comparable,
      headphones: d.headphones,
    });
    setQ("");
  };
  const generic: { kind: Device["kind"]; label: string }[] = [
    { kind: "earbuds", label: "Other earbuds" },
    { kind: "over_ear", label: "Over-ear headphones" },
    { kind: "unknown", label: "Not sure" },
  ];
  const offsets = detail.data?.offsets ?? {};
  const measured = device.kind === "catalogue" && Object.keys(offsets).length > 0;

  return (
    <div className="glass rounded-[1.6rem] p-6 sm:p-8" data-device-picker="">
      <p className="text-[15px] text-ink">What are you listening on right now?</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        You&rsquo;ll hear every choice through them. If AURALS has measured them, it knows how they already
        sound and takes that into account.
      </p>

      <AnimatePresence mode="wait" initial={false}>
        {device.kind === "catalogue" && device.label ? (
          <motion.div
            key={`chosen-${device.slug}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
            className="mt-5 rounded-2xl bg-white/[0.035] p-4 shadow-[inset_0_0_0_1px_rgb(255_236_222/0.18)]"
          >
            <div className="flex items-center gap-4">
              <DeviceThumb image={device.image} label={device.label} className="size-16" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[15px] text-ink">
                  <Check className="size-4 shrink-0 text-sun" />
                  <span className="truncate">{device.label}</span>
                </p>
                <p className="mt-1 text-[12px] leading-snug text-ink-faint">
                  {device.comparable
                    ? "Measured on the same rig as the target"
                    : device.headphones
                      ? "Headphones, measured on a headphone rig"
                      : "Measured on a different test rig"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChange({ kind: "unknown" })}
                aria-label="Choose a different device"
                className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
            {measured ? (
              <div className="mt-4 grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-4">
                <div className="h-12">
                  <MiniCurve offsets={{ ...zeros(), ...offsets }} active />
                </div>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">
                  {leanings(offsets)} AURALS adds that back, so what you choose is read as what you want, not
                  as a reaction to them.
                </p>
              </div>
            ) : (
              !device.comparable && (
                <p className="mt-4 text-[12.5px] leading-relaxed text-ink-muted">
                  A curve from another rig can&rsquo;t be subtracted from our target exactly, so AURALS
                  remembers them but counts your choices a little less rather than guess.
                </p>
              )
            )}
          </motion.div>
        ) : (
          <motion.div
            key="choose"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
          >
            <label className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] focus-within:shadow-[inset_0_0_0_1px_rgb(255_236_222/0.4)]">
              <Search className="size-4 text-ink-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search — AirPods, Galaxy Buds, Moondrop Chu…"
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
                aria-label="Search your earphones or headphones"
              />
            </label>
            {q.trim().length >= 2 ? (
              <ul className="mt-2 max-h-64 overflow-auto rounded-xl">
                {(found.data ?? []).map((d) => (
                  <li key={d.slug}>
                    <button
                      type="button"
                      onClick={() => pick(d)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <DeviceThumb image={d.image_path} label={d.label} className="size-9 rounded-lg" />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-muted">{d.label}</span>
                      {d.comparable ? (
                        <span className="shrink-0 text-[10.5px] text-sun/80">measured</span>
                      ) : d.headphones ? (
                        <span className="shrink-0 text-[10.5px] text-ink-faint">headphones</span>
                      ) : null}
                    </button>
                  </li>
                ))}
                {found.data?.length === 0 && (
                  <li className="px-3 py-2 text-[13px] text-ink-faint">
                    Not in the measured catalogue — pick the closest kind below.
                  </li>
                )}
              </ul>
            ) : (
              popular.data &&
              popular.data.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] tracking-[0.18em] text-ink-faint uppercase">Popular</p>
                    <div
                      className="flex gap-1 rounded-full bg-white/[0.03] p-0.5"
                      role="tablist"
                      aria-label="Kind"
                    >
                      {(["earphones", "headphones"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          role="tab"
                          aria-selected={shelf === k}
                          onClick={() => setShelf(k)}
                          className={cn(
                            "relative rounded-full px-3 py-1 text-[11.5px] capitalize transition-colors",
                            shelf === k ? "text-ink" : "text-ink-faint hover:text-ink-muted",
                          )}
                        >
                          {shelf === k && (
                            <motion.span
                              layoutId="device-shelf"
                              className="absolute inset-0 rounded-full bg-white/[0.09]"
                              transition={{ type: "spring", stiffness: 400, damping: 32 }}
                            />
                          )}
                          <span className="relative">{k}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {popular.data.slice(0, 8).map((d, i) => (
                      <motion.button
                        key={d.slug}
                        type="button"
                        onClick={() => pick(d)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.03 * i, ease }}
                        whileHover={{ y: -2 }}
                        className="group flex flex-col items-center gap-2 rounded-xl p-2 text-center shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] transition-shadow hover:shadow-[inset_0_0_0_1px_rgb(255_236_222/0.35)]"
                      >
                        <DeviceThumb image={d.image_path} label={d.label} className="aspect-square w-full" />
                        <span className="line-clamp-2 text-[11.5px] leading-tight text-ink-muted group-hover:text-ink">
                          {d.label}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex flex-wrap gap-2">
        {generic.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => onChange({ kind: c.kind })}
            aria-pressed={device.kind === c.kind}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] transition-[background-color,box-shadow,color] duration-300",
              device.kind === c.kind
                ? "bg-white/[0.1] text-ink shadow-[inset_0_0_0_1px_rgb(255_236_222/0.45)]"
                : "text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] hover:text-ink",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StageHead({
  step,
  title,
  note,
  player,
  playing,
  onToggle,
  clipTitle,
  onChangeSong,
}: {
  step: string;
  title: React.ReactNode;
  note: string;
  player: TuningPlayer | null;
  playing: boolean;
  onToggle: () => void;
  clipTitle?: string | null;
  onChangeSong?: () => void;
}) {
  const ring = useRef<HTMLButtonElement>(null);
  useLevel(player, ring, playing);
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="eyebrow eyebrow-rule">Listening · {step}</p>
        <h1 className="marquee mt-4 text-[clamp(2.4rem,5vw,4.6rem)]">{title}</h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-muted">{note}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          ref={ring}
          type="button"
          onClick={onToggle}
          className="group flex items-center gap-3 rounded-full py-2 pr-4 pl-2 text-left text-[13px] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] transition-colors hover:text-ink"
          aria-label={playing ? "Pause" : "Play"}
        >
          <span
            className="grid size-9 place-items-center rounded-full bg-linear-to-br from-sun to-flamingo text-[#1b1220]"
            style={{
              boxShadow:
                "0 0 calc(6px + var(--level, 0) * 34px) calc(var(--level, 0) * 8px) rgb(255 138 98 / 0.55)",
            }}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </span>
          <span className="max-w-48 truncate">{clipTitle ?? "Built-in track"}</span>
        </button>
        {onChangeSong && (
          <button
            type="button"
            onClick={onChangeSong}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] text-ink-faint transition-colors hover:text-ink"
          >
            <Music2 className="size-3.5" /> Your own song
          </button>
        )}
      </div>
    </div>
  );
}

function ShapeCard({
  shape,
  active,
  order,
  onClick,
}: {
  shape: TuningShape;
  active: boolean;
  order: number;
  onClick: () => void;
}) {
  const offsets = { ...zeros(), ...shape.offsets } as Offsets;
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.1 + order * 0.06, ease }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl p-4 text-left transition-[box-shadow,background-color] duration-500",
        active
          ? "bg-white/[0.08] shadow-[inset_0_0_0_1px_rgb(241_211_155/0.6),0_18px_40px_-18px_rgb(255_138_98/0.6)]"
          : "glass hover:bg-white/[0.05]",
      )}
    >
      <div className="h-14">
        <MiniCurve offsets={offsets} active={active} />
      </div>
      <span className={cn("mt-3 text-[15px]", active ? "text-ink" : "text-ink-muted")}>{shape.label}</span>
      <span className="mt-1 text-[12px] leading-snug text-ink-faint">{shape.blurb}</span>
      {active && (
        <motion.span
          layoutId="shape-active"
          className="absolute inset-x-4 bottom-0 h-px bg-linear-to-r from-sun via-coral to-flamingo"
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

function Pad({
  side,
  heard,
  player,
  onListen,
}: {
  side: Side;
  heard: boolean;
  player: TuningPlayer | null;
  onListen: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useLevel(player, ref, heard);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onListen}
      aria-pressed={heard}
      aria-label={`Listen to ${side.toUpperCase()}`}
      className="group relative mx-auto grid aspect-square w-full max-w-[300px] place-items-center rounded-full outline-none"
    >
      {/* Rings that breathe with the music while this side is heard. */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute inset-0 rounded-full transition-opacity duration-500"
          style={{
            opacity: heard ? 0.75 - i * 0.22 : 0.08,
            transform: heard
              ? `scale(calc(${0.78 + i * 0.1} + var(--level, 0) * ${0.12 + i * 0.06}))`
              : `scale(${0.78 + i * 0.08})`,
            background:
              side === "a"
                ? "radial-gradient(circle, transparent 58%, rgb(255 138 98 / 0.55) 60%, transparent 72%)"
                : "radial-gradient(circle, transparent 58%, rgb(185 166 255 / 0.55) 60%, transparent 72%)",
            transition: "opacity 0.5s, transform 0.12s linear",
          }}
        />
      ))}
      <span
        className={cn(
          "relative grid size-[62%] place-items-center rounded-full transition-[background-color,box-shadow,transform] duration-500 group-active:scale-95",
          heard ? "bg-white/[0.1]" : "bg-white/[0.03] group-hover:bg-white/[0.06]",
        )}
        style={{
          boxShadow: heard
            ? `inset 0 1px 0 rgb(255 255 255 / 0.25), 0 0 calc(30px + var(--level, 0) * 60px) ${side === "a" ? "rgb(255 138 98 / 0.4)" : "rgb(185 166 255 / 0.4)"}`
            : "inset 0 0 0 1px rgb(255 255 255 / 0.1)",
        }}
      >
        <span
          className={cn(
            "font-display text-[clamp(3rem,8vw,6rem)] leading-none",
            heard ? "text-ink" : "text-ink-faint",
          )}
        >
          {side.toUpperCase()}
        </span>
        <span className="absolute bottom-[18%] text-[11px] tracking-[0.2em] text-ink-faint uppercase">
          {heard ? "Playing" : "Tap to hear"}
        </span>
      </span>
    </button>
  );
}

/** Which song this pair is on, why, and the switch between matched songs and one song. */
function SongLine({
  song,
  custom,
  available,
  preparing,
  matching,
  onToggle,
}: {
  song: Song | null;
  custom: string | null;
  available: boolean;
  preparing: boolean;
  matching: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={song?.key ?? custom ?? "one"}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.35, ease }}
          className="min-w-0 text-[12.5px] leading-snug text-ink-muted"
        >
          {song ? (
            <>
              <Music2 className="mr-1.5 inline size-3.5 -translate-y-px text-sun" />
              <span className="text-ink">{song.title}</span>
              <span className="text-ink-faint">
                {" "}
                · {song.artist} — chosen for this question: {song.why}.
              </span>
            </>
          ) : custom ? (
            <>
              <Music2 className="mr-1.5 inline size-3.5 -translate-y-px text-sun" />
              Every pair on <span className="text-ink">{custom}</span>, your choice.
            </>
          ) : preparing ? (
            "Cutting a song from your playlist for each question…"
          ) : available ? (
            "One song for every pair."
          ) : (
            "One song for every pair — add a playlist and each question gets a song of its own."
          )}
        </motion.p>
      </AnimatePresence>
      {available && (
        <button
          type="button"
          role="switch"
          aria-checked={matching}
          onClick={onToggle}
          className="group flex shrink-0 items-center gap-2.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
        >
          Match the song to each question
          <span
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors duration-300",
              matching ? "bg-linear-to-r from-sun to-flamingo" : "bg-white/15",
            )}
          >
            <motion.span
              className="absolute top-0.5 size-4 rounded-full bg-white shadow"
              animate={{ left: matching ? 18 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
            />
          </span>
        </button>
      )}
    </div>
  );
}

function Progress({ done }: { done: number }) {
  return (
    <div className="mt-6 flex items-center gap-2" aria-label={`Comparison ${done + 1} of ${TRIALS}`}>
      {Array.from({ length: TRIALS }, (_, i) => (
        <motion.span
          key={i}
          className="h-1 flex-1 rounded-full"
          initial={false}
          animate={{
            backgroundColor:
              i < done
                ? "rgb(241 211 155 / 0.9)"
                : i === done
                  ? "rgb(255 138 98 / 0.9)"
                  : "rgb(255 255 255 / 0.1)",
            scaleY: i === done ? 1.8 : 1,
          }}
          transition={{ duration: 0.5 }}
        />
      ))}
    </div>
  );
}

const PLAIN: Record<Tonal, [string, string]> = {
  sub_bass: ["more deep bass", "less deep bass"],
  mid_bass: ["more bass punch", "less bass punch"],
  warmth: ["more warmth", "a leaner low-mid"],
  vocal_presence: ["vocals further forward", "vocals set back"],
  treble: ["more treble", "softer treble"],
  air: ["more air and sparkle", "less sparkle"],
};

function ResultWords({
  beliefs,
  session,
  pending,
}: {
  beliefs: Record<Tonal, Belief>;
  session: TuningSession | null;
  pending: boolean;
}) {
  const ranked = [...TONAL].sort((a, b) => Math.abs(beliefs[b].mean) - Math.abs(beliefs[a].mean));
  const notable = ranked.filter((d) => Math.abs(beliefs[d].mean) >= 1).slice(0, 3);
  const consistency =
    session?.consistency === "consistent"
      ? "You answered the repeated pair the same way both times, so your choices count fully."
      : session?.consistency === "mixed"
        ? "Your answer to the repeated pair changed, so your music and answers carry a little more weight."
        : null;
  return (
    <div className="mt-6 grid max-w-3xl gap-3">
      {notable.length ? (
        <p className="text-[18px] leading-relaxed text-ink">
          Compared with the research reference, you chose{" "}
          {notable.map((d, i) => (
            <span key={d}>
              <span className="text-sunset font-display text-[1.15em] italic">
                {PLAIN[d][beliefs[d].mean > 0 ? 0 : 1]}
              </span>{" "}
              <span className="text-ink-faint">
                ({beliefs[d].mean > 0 ? "+" : ""}
                {beliefs[d].mean.toFixed(1)} dB)
              </span>
              {i < notable.length - 2 ? ", " : i === notable.length - 2 ? " and " : "."}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-[18px] text-ink">
          You chose a sound close to the research reference all the way across.
        </p>
      )}
      <p className="text-[14px] text-ink-muted">
        {pending
          ? "Adding this to your sound…"
          : (consistency ?? "This now shapes your sound, alongside your music and answers.")}
      </p>
    </div>
  );
}
