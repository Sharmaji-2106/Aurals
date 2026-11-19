"use client";

import type { ReviewSource, ReviewTopic } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { motion } from "motion/react";
import { useId } from "react";

/**
 * The evidence constellation: the sources on an outer ring, the themes they raise on
 * an inner one, and an edge wherever a source actually says something about a theme.
 *
 * Nothing here is invented to fill the picture. A theme only exists because a quoted
 * passage was read as being about it, and an edge only exists because that passage
 * came from that source. Where reviewers disagree — some hearing sparkle in the treble
 * and another hearing it roll off early — the theme is drawn split and labelled, never
 * averaged into a consensus that nobody actually stated.
 *
 * Edge colour carries the stance of the passage behind it: mint for a positive
 * reading, ember for a negative one, grey for a mixed one.
 */
const W = 980;
const H = 470;
// The outer ring leaves room for the source labels that sit beside it.
const OUTER = { rx: 320, ry: 178 };
const INNER = { rx: 172, ry: 94 };

/** Short names, so adjacent themes do not collide at this size. */
const SHORT: Record<string, string> = {
  bass: "Bass",
  vocals: "Vocals",
  treble: "Treble",
  detail: "Detail",
  soundstage: "Soundstage",
  fit: "Fit",
  isolation: "Isolation",
  build: "Build",
};

export const STANCE_COLOR = {
  positive: "#b8e3d6",
  negative: "#ff6b3d",
  mixed: "#a29d95",
} as const;

type Placed = { id: string; x: number; y: number };

function ring(count: number, rx: number, ry: number, turn = 0) {
  return (i: number) => {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2 + turn;
    return { x: W / 2 + Math.cos(angle) * rx, y: H / 2 + Math.sin(angle) * ry };
  };
}

export function Constellation({
  topics,
  sources,
  activeTopic,
  activeSource,
  onTopic,
  onSource,
  reveal = 1,
  className,
}: {
  topics: ReviewTopic[];
  sources: ReviewSource[];
  activeTopic: string | null;
  activeSource: string | null;
  onTopic: (slug: string | null) => void;
  onSource: (id: string | null) => void;
  reveal?: number;
  className?: string;
}) {
  const uid = useId();
  const sourceAt = ring(sources.length, OUTER.rx, OUTER.ry, 0.35);
  const topicAt = ring(topics.length, INNER.rx, INNER.ry, -0.2);
  const sourceNodes: Placed[] = sources.map((s, i) => ({ id: s.id, ...sourceAt(i) }));
  const topicNodes: Placed[] = topics.map((t, i) => ({ id: t.slug, ...topicAt(i) }));
  const byId = new Map(sourceNodes.map((n) => [n.id, n]));
  const byTopic = new Map(topicNodes.map((n) => [n.id, n]));

  const edges = sources.flatMap((source) =>
    source.claims.map((claim) => ({
      key: claim.id,
      from: byId.get(source.id)!,
      to: byTopic.get(claim.topic)!,
      stance: claim.stance,
      sourceId: source.id,
      topic: claim.topic,
    })),
  );

  const lit = (sourceId: string, topic: string) =>
    (!activeTopic && !activeSource) || activeTopic === topic || activeSource === sourceId;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("w-full", className)}
      role="group"
      aria-label="Evidence constellation: sources, the themes they raise, and which supports which"
    >
      <defs>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0" stopColor="#ff6b3d" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff6b3d" stopOpacity="0" />
        </radialGradient>
      </defs>

      {edges.map((edge, i) => {
        const on = lit(edge.sourceId, edge.topic);
        // A gentle bow towards the middle keeps parallel edges apart.
        const mx = (edge.from.x + edge.to.x) / 2 + (W / 2 - (edge.from.x + edge.to.x) / 2) * 0.22;
        const my = (edge.from.y + edge.to.y) / 2 + (H / 2 - (edge.from.y + edge.to.y) / 2) * 0.22;
        return (
          <motion.path
            key={edge.key}
            d={`M${edge.from.x} ${edge.from.y}Q${mx} ${my} ${edge.to.x} ${edge.to.y}`}
            fill="none"
            stroke={STANCE_COLOR[edge.stance]}
            strokeWidth={on ? 1.3 : 0.7}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: reveal, opacity: on ? 0.55 : 0.12 }}
            transition={{ pathLength: { duration: 1.2, delay: i * 0.035 }, opacity: { duration: 0.3 } }}
          />
        );
      })}

      {topics.map((topic, i) => {
        const node = byTopic.get(topic.slug)!;
        const on = activeTopic === topic.slug;
        const total = topic.positive + topic.negative + topic.mixed;
        const r = 15 + Math.min(10, total * 1.6);
        return (
          <motion.g
            key={topic.slug}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`${topic.label}: ${total} passage${total === 1 ? "" : "s"} from ${topic.sources.length} source${topic.sources.length === 1 ? "" : "s"}${topic.contested ? ", reviewers disagree" : ""}`}
            onClick={() => onTopic(on ? null : topic.slug)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTopic(on ? null : topic.slug);
              }
            }}
            className="cursor-pointer focus-visible:outline-none"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: reveal, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: `${node.x}px ${node.y}px` }}
          >
            {on && <circle cx={node.x} cy={node.y} r={r * 2.4} fill={`url(#${uid}-halo)`} />}
            {/* A contested theme is drawn as two arcs that do not agree. */}
            {topic.contested ? (
              <>
                <path
                  d={`M${node.x} ${node.y - r}A${r} ${r} 0 0 1 ${node.x} ${node.y + r}`}
                  fill="none"
                  stroke={STANCE_COLOR.positive}
                  strokeWidth="2"
                />
                <path
                  d={`M${node.x} ${node.y + r}A${r} ${r} 0 0 1 ${node.x} ${node.y - r}`}
                  fill="none"
                  stroke={STANCE_COLOR.negative}
                  strokeWidth="2"
                />
              </>
            ) : (
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill="none"
                stroke={topic.negative > topic.positive ? STANCE_COLOR.negative : STANCE_COLOR.positive}
                strokeWidth="1.6"
                opacity={0.75}
              />
            )}
            <circle cx={node.x} cy={node.y} r={r - 3} fill="#0e0e11" opacity={on ? 0.95 : 0.8} />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              className="numeric pointer-events-none fill-ink text-[11px]"
            >
              {total}
            </text>
            <text
              x={node.x}
              y={node.y + r + 15}
              textAnchor="middle"
              className={cn("pointer-events-none text-[11px]", on ? "fill-ink" : "fill-ink-muted")}
            >
              {SHORT[topic.slug] ?? topic.label}
            </text>
            {topic.contested && (
              <text
                x={node.x}
                y={node.y + r + 28}
                textAnchor="middle"
                className="pointer-events-none fill-ink-faint text-[9px] tracking-[0.1em] uppercase"
              >
                they disagree
              </text>
            )}
          </motion.g>
        );
      })}

      {sources.map((source, i) => {
        const node = byId.get(source.id)!;
        const on = activeSource === source.id;
        const related = activeTopic ? source.claims.some((c) => c.topic === activeTopic) : true;
        const label = source.publication;
        const right = node.x > W / 2;
        return (
          <motion.g
            key={source.id}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`${source.publication}${source.author ? ` by ${source.author}` : ""}: ${source.claims.length} quoted passage${source.claims.length === 1 ? "" : "s"}`}
            onClick={() => onSource(on ? null : source.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSource(on ? null : source.id);
              }
            }}
            className="cursor-pointer focus-visible:outline-none"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: reveal * (related ? 1 : 0.3), scale: 1 }}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: `${node.x}px ${node.y}px` }}
          >
            <circle cx={node.x} cy={node.y} r={on ? 7 : 5} fill={on ? "#ff6b3d" : "#eeebe5"} />
            <circle
              cx={node.x}
              cy={node.y}
              r={13}
              fill="none"
              stroke={on ? "#ff6b3d" : "#ffffff"}
              strokeOpacity={on ? 0.6 : 0.16}
            />
            <text
              x={right ? node.x + 20 : node.x - 20}
              y={node.y + 4}
              textAnchor={right ? "start" : "end"}
              className={cn("pointer-events-none text-[12px]", on ? "fill-ink" : "fill-ink-muted")}
            >
              {label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

/** Node positions, so a tracer can travel the same graph the viewer sees. */
export function layout(topics: ReviewTopic[], sources: ReviewSource[]) {
  const sourceAt = ring(sources.length, OUTER.rx, OUTER.ry, 0.35);
  const topicAt = ring(topics.length, INNER.rx, INNER.ry, -0.2);
  return {
    width: W,
    height: H,
    sources: new Map(sources.map((s, i) => [s.id, sourceAt(i)])),
    topics: new Map(topics.map((t, i) => [t.slug, topicAt(i)])),
  };
}
