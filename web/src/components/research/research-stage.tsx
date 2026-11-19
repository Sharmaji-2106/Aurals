"use client";

import { Constellation, layout, STANCE_COLOR } from "@/components/research/constellation";
import { ReviewCard } from "@/components/research/review-card";
import { Button } from "@/components/ui/button";
import type { ReviewClaim, Reviews, ReviewSource } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The research reveal, and then the research itself.
 *
 * Three phases of roughly twelve seconds, and after them an interactive graph the
 * viewer can stay in for as long as they like:
 *
 *   cards  the sources arrive out of the dark and settle into a readable field
 *   trace  a point travels from a source to a passage it contains, lights the theme
 *          that passage is about, and leaves an evidence marker behind
 *   graph  the cards fall back to the ring and the constellation closes
 *
 * The tracer walks real claims — a quoted passage, its source, its theme — picked to
 * show the disagreements first. Nothing is being fetched while it runs, and the header
 * says so: this is a replay of evidence that was gathered and checked on a known date,
 * not a crawl. The whole reveal can be skipped without losing anything.
 */
const PHASES = { cards: 3800, trace: 5200, graph: 2600 } as const;
const TRACE_STEPS = 5;
const CARD_RING = 0.76; // the cards sit inside the constellation's own ring

type Phase = "cards" | "trace" | "graph" | "explore";

type Step = { claim: ReviewClaim; source: ReviewSource };

/** What the tracer visits: the contested themes first, one passage per theme. */
function traceOrder(data: Reviews): Step[] {
  const bySlug = new Map(data.topics.map((t) => [t.slug, t]));
  const steps: Step[] = [];
  const used = new Set<string>();
  const candidates = data.sources.flatMap((source) => source.claims.map((claim) => ({ claim, source })));
  const score = (s: Step) => {
    const topic = bySlug.get(s.claim.topic);
    if (!topic) return 0;
    return (topic.contested ? 100 : 0) + topic.sources.length;
  };
  for (const step of [...candidates].sort((a, b) => score(b) - score(a))) {
    if (used.has(step.claim.topic)) continue;
    used.add(step.claim.topic);
    steps.push(step);
    if (steps.length === TRACE_STEPS) break;
  }
  return steps;
}

export function ResearchStage({ data }: { data: Reviews }) {
  const reduced = useReducedMotion();
  // The spatial reveal needs room; a phone goes straight to the graph and the list.
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window === "undefined") return "explore";
    return window.matchMedia("(min-width: 768px)").matches ? "cards" : "explore";
  });
  const [step, setStep] = useState(0);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const steps = traceOrder(data);
  const geometry = layout(data.topics, data.sources);

  const skip = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setActiveTopic(null);
    setActiveSource(null);
    setPhase("explore");
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    if (reduced || phase !== "cards") return;
    const traceStep = PHASES.trace / Math.max(1, steps.length);
    timers.current.push(window.setTimeout(() => setPhase("trace"), PHASES.cards));
    for (let i = 0; i < steps.length; i++) {
      timers.current.push(window.setTimeout(() => setStep(i), PHASES.cards + i * traceStep));
    }
    timers.current.push(window.setTimeout(() => setPhase("graph"), PHASES.cards + PHASES.trace));
    timers.current.push(
      window.setTimeout(() => setPhase("explore"), PHASES.cards + PHASES.trace + PHASES.graph),
    );
    // Only ever started once, from the opening phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Reduced motion skips straight to the graph, derived rather than set, so no
  // frame of the reveal is ever painted.
  const shown: Phase = reduced ? "explore" : phase;
  const tracing = shown === "trace";
  const current = tracing ? steps[Math.min(step, steps.length - 1)] : null;
  // While the tracer runs, the card it is standing on is the one that is lit.
  const litSource = current ? current.source.id : activeSource;

  const chooseSource = (id: string | null) => {
    setActiveSource(id);
    setOpenSource(id);
    if (id) {
      window.requestAnimationFrame(() => {
        listRef.current
          ?.querySelector(`[data-source="${id}"]`)
          ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      });
    }
  };

  const ordered = activeTopic
    ? [
        ...data.sources.filter((s) => s.claims.some((c) => c.topic === activeTopic)),
        ...data.sources.filter((s) => !s.claims.some((c) => c.topic === activeTopic)),
      ]
    : data.sources;

  return (
    <div className="flex flex-col">
      {/* The reveal happens here, and the finished graph stays here. */}
      <div className="relative" style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }}>
        <AnimatePresence>
          {(shown === "cards" || tracing) && (
            <motion.div
              key="field"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.7 } }}
            >
              {data.sources.map((source, i) => {
                const at = geometry.sources.get(source.id)!;
                const lit = litSource === source.id;
                return (
                  <motion.div
                    key={source.id}
                    className="absolute w-[30%] max-w-[18rem] -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${(((at.x - geometry.width / 2) * CARD_RING + geometry.width / 2) / geometry.width) * 100}%`,
                      top: `${(((at.y - geometry.height / 2) * CARD_RING + geometry.height / 2) / geometry.height) * 100}%`,
                    }}
                    initial={{ opacity: 0, scale: 0.75, y: 28, rotate: ((i * 53) % 11) - 5 }}
                    animate={{
                      opacity: tracing && !lit ? 0.35 : 1,
                      scale: lit ? 1.06 : 1,
                      y: 0,
                      rotate: lit ? 0 : ((i * 53) % 11) - 5,
                      zIndex: lit ? 20 : 1,
                    }}
                    transition={{ duration: 0.9, delay: tracing ? 0 : i * 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <FieldCard source={source} claim={lit ? current?.claim : undefined} />
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* The tracer, travelling the real edge between a source and its theme. */}
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          className="pointer-events-none absolute inset-0 size-full"
          aria-hidden="true"
        >
          <AnimatePresence>
            {current && <Tracer key={step} step={current} geometry={geometry} />}
          </AnimatePresence>
        </svg>

        <AnimatePresence>
          {(shown === "graph" || shown === "explore") && (
            <motion.div
              key="graph"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              <Constellation
                topics={data.topics}
                sources={data.sources}
                activeTopic={activeTopic}
                activeSource={activeSource}
                onTopic={(slug) => {
                  setActiveTopic(slug);
                  setActiveSource(null);
                }}
                onSource={chooseSource}
                className="size-full"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {shown !== "explore" && (
          <Button variant="secondary" size="sm" onClick={skip} className="absolute right-0 bottom-0 z-30">
            Skip to the evidence
          </Button>
        )}
      </div>

      {/* The themes, as a list, for anyone who would rather not use the graph. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Themes</span>
        {data.topics.map((topic) => (
          <button
            key={topic.slug}
            type="button"
            aria-pressed={activeTopic === topic.slug}
            onClick={() => {
              setActiveTopic(activeTopic === topic.slug ? null : topic.slug);
              setActiveSource(null);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
              activeTopic === topic.slug
                ? "border-white/35 bg-white/[0.07] text-ink"
                : "border-hairline-strong text-ink-muted hover:border-white/25 hover:text-ink",
            )}
          >
            {topic.label}
            <span className="numeric text-ink-faint">{topic.positive + topic.negative + topic.mixed}</span>
            {topic.contested && (
              <span
                className="size-1.5 rounded-full"
                style={{ background: STANCE_COLOR.negative }}
                title="Reviewers disagree on this"
              />
            )}
          </button>
        ))}
        {activeTopic && (
          <button
            type="button"
            onClick={() => setActiveTopic(null)}
            className="text-[12px] text-ink-faint underline decoration-white/20 underline-offset-4 hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>

      {activeTopic && (
        <TopicNote
          topic={data.topics.find((t) => t.slug === activeTopic)!}
          sources={data.sources}
          className="mt-5"
        />
      )}

      <div ref={listRef} className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {ordered.map((source) => (
          <div key={source.id} data-source={source.id}>
            <ReviewCard
              source={source}
              open={openSource === source.id}
              highlightTopic={activeTopic}
              onOpen={() => {
                const next = openSource === source.id ? null : source.id;
                setOpenSource(next);
                setActiveSource(next);
              }}
              className={cn(
                activeTopic && !source.claims.some((c) => c.topic === activeTopic) && "opacity-55",
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** What a source looks like while the field is still a field. */
function FieldCard({ source, claim }: { source: ReviewSource; claim?: ReviewClaim }) {
  return (
    <div className="rounded-2xl border border-hairline-strong bg-panel/90 p-4 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.9)] backdrop-blur">
      <p className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] text-ink">{source.publication}</span>
        <span className="numeric shrink-0 text-[10px] text-ink-faint">
          {source.published_on?.slice(0, 4)}
        </span>
      </p>
      {source.author && <p className="mt-0.5 truncate text-[11px] text-ink-faint">{source.author}</p>}
      <AnimatePresence mode="wait">
        <motion.p
          key={claim?.id ?? "excerpt"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className={cn(
            "mt-3 text-[12px] leading-relaxed",
            claim ? "text-ink" : "line-clamp-2 text-ink-faint italic",
          )}
        >
          &ldquo;{claim ? claim.quote : source.excerpt}&rdquo;
        </motion.p>
      </AnimatePresence>
      {claim && (
        <p
          className="mt-2 text-[10px] tracking-[0.1em] uppercase"
          style={{ color: STANCE_COLOR[claim.stance] }}
        >
          {claim.topic_label}
        </p>
      )}
    </div>
  );
}

/** The luminous point: source, passage, theme, marker. */
function Tracer({ step, geometry }: { step: Step; geometry: ReturnType<typeof layout> }) {
  const from = geometry.sources.get(step.source.id);
  const to = geometry.topics.get(step.claim.topic);
  if (!from || !to) return null;
  const mid = {
    x: (from.x + to.x) / 2 + (geometry.width / 2 - (from.x + to.x) / 2) * 0.3,
    y: (from.y + to.y) / 2 + (geometry.height / 2 - (from.y + to.y) / 2) * 0.3,
  };
  const d = `M${from.x} ${from.y}Q${mid.x} ${mid.y} ${to.x} ${to.y}`;
  const colour = STANCE_COLOR[step.claim.stance];

  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.path
        d={d}
        fill="none"
        stroke={colour}
        strokeWidth="1.6"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0.9 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.circle
        r="4"
        fill={colour}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        style={{ offsetPath: `path("${d}")`, offsetRotate: "0deg" }}
      />
      {/* The marker it leaves on the theme. */}
      <motion.circle
        cx={to.x}
        cy={to.y}
        r="18"
        fill="none"
        stroke={colour}
        strokeWidth="1.2"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.8 }}
        transition={{ duration: 0.5, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: `${to.x}px ${to.y}px` }}
      />
      <motion.text
        x={to.x}
        y={to.y + 36}
        textAnchor="middle"
        className="fill-ink text-[12px]"
        initial={{ opacity: 0, y: to.y + 30 }}
        animate={{ opacity: 1, y: to.y + 36 }}
        transition={{ delay: 0.75 }}
      >
        {step.claim.topic_label}
      </motion.text>
    </motion.g>
  );
}

/** What this theme actually rests on, in words, including where it is contested. */
function TopicNote({
  topic,
  sources,
  className,
}: {
  topic: Reviews["topics"][number];
  sources: ReviewSource[];
  className?: string;
}) {
  const supporting = sources.filter((s) => s.claims.some((c) => c.topic === topic.slug));
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("border-l-2 pl-4", className)}
      style={{ borderColor: topic.contested ? STANCE_COLOR.negative : STANCE_COLOR.positive }}
    >
      <p className="text-[14px] text-ink">
        {topic.contested ? (
          <>
            Reviewers <em className="text-ember-soft not-italic">disagree</em> about{" "}
            {topic.label.toLowerCase()}.
          </>
        ) : (
          <>
            {topic.label} is raised by {plural(supporting.length, "source")}.
          </>
        )}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
        {topic.positive} passage{topic.positive === 1 ? "" : "s"} read as positive, {topic.negative} as
        negative, {topic.mixed} as mixed, across {plural(supporting.length, "source")}.
        {topic.contested
          ? " Both readings are below, from the people who wrote them. AURALS does not pick a winner."
          : ""}
      </p>
    </motion.div>
  );
}
