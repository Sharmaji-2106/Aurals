"use client";

import { EvidenceTag } from "@/components/profile/evidence-tag";
import { SAID_COLOR } from "@/components/signature/stage";
import type { Dimension } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const SOURCE_LABEL: Record<string, string> = {
  prior: "Neutral start",
  music: "Your music",
  questionnaire: "Your answers",
  feedback: "Your feedback",
  listening: "Your ears",
};

export const SOURCE_COLOR: Record<string, string> = {
  prior: "#6b675f",
  music: "rgb(238 235 229 / 0.75)",
  questionnaire: SAID_COLOR,
  feedback: "#86d6ad",
  listening: "#ffa07d",
};

export function leanWord(d: Pick<Dimension, "value" | "low_label" | "high_label" | "group" | "confidence">) {
  if (d.confidence < 0.2) return "Not enough evidence";
  const delta = d.value - 0.5;
  if (d.group === "priority") {
    if (d.value >= 0.75) return "Top priority";
    if (d.value >= 0.58) return "Important";
    if (d.value <= 0.3) return "Not a focus";
    return "Some importance";
  }
  if (Math.abs(delta) < 0.07) return "Neutral";
  const side = delta > 0 ? d.high_label : d.low_label;
  return Math.abs(delta) > 0.22 ? `Strongly ${side.toLowerCase()}` : `Leaning ${side.toLowerCase()}`;
}

/** Shared legend for a group of meters. */
export function MeterLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-faint">
      <span className="flex items-center gap-2">
        <span className="size-2.5 rounded-full border-2 border-canvas bg-ink ring-1 ring-white/30" /> your
        sound
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-[2px]" style={{ background: SOURCE_COLOR.music }} /> your music suggests
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-[2px]" style={{ background: SOURCE_COLOR.questionnaire }} /> you said
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2 w-5 rounded-full bg-white/10" /> uncertainty
      </span>
    </div>
  );
}

/**
 * One preference dimension: where the evidence pointed and where it landed. Uncertainty
 * is drawn as a span around the result instead of being repeated as text.
 */
export function DimensionMeter({ dimension: d, index = 0 }: { dimension: Dimension; index?: number }) {
  const [open, setOpen] = useState(false);
  const bipolar = d.group !== "priority";
  const spread = (1 - d.confidence) * 0.22;
  const lo = Math.max(0, d.value - spread);
  const hi = Math.min(1, d.value + spread);
  const markers = [
    { source: "music", value: d.music_value },
    { source: "questionnaire", value: d.answer_value },
  ].filter((m): m is { source: string; value: number } => m.value !== null);
  const ease = [0.16, 1, 0.3, 1] as const;

  return (
    <div className="border-b border-hairline py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full flex-col gap-2.5 text-left"
      >
        <div className="flex w-full items-baseline justify-between gap-4">
          <span className="text-[15px] text-ink">{d.label}</span>
          <span className="flex items-center gap-2 text-[13px] text-ink-muted">
            {leanWord(d)}
            <ChevronDown
              className={cn("size-3.5 text-ink-faint transition-transform", open && "rotate-180")}
            />
          </span>
        </div>
        <div className="relative h-5 w-full">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
          {bipolar && <div className="absolute top-1 left-1/2 h-3 w-px bg-white/20" />}
          <motion.div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/[0.09]"
            initial={{ left: "50%", width: 0 }}
            whileInView={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.1 + index * 0.04, ease }}
          />
          {markers.map((m) => (
            <motion.div
              key={m.source}
              className="absolute top-0.5 h-4 w-[2px] -translate-x-1/2"
              style={{ background: SOURCE_COLOR[m.source] }}
              initial={{ left: "50%", opacity: 0 }}
              whileInView={{ left: `${m.value * 100}%`, opacity: 0.9 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.15 + index * 0.04, ease }}
            />
          ))}
          <motion.div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas bg-ink"
            initial={{ left: bipolar ? "50%" : "0%" }}
            whileInView={{ left: `${d.value * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1.1, delay: 0.2 + index * 0.04, ease }}
            style={{
              boxShadow: `0 0 ${4 + 14 * d.confidence}px rgb(255 255 255 / ${0.1 + 0.45 * d.confidence})`,
            }}
          />
        </div>
        <div className="flex w-full justify-between text-[11px] text-ink-faint">
          <span>{d.low_label}</span>
          <span>{d.high_label}</span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden"
          >
            <div className="mt-4 border-l border-hairline-strong pl-4">
              <p className="text-[13px] text-ink-muted">{d.description}</p>
              <EvidenceTag basis={d.basis} className="mt-3" />
              <ul className="mt-3 flex flex-col gap-2">
                {d.evidence
                  .filter((e) => e.source !== "prior")
                  .map((e) => (
                    <li key={e.source} className="flex items-start gap-3 text-[12px]">
                      <span
                        className="mt-1 size-2 shrink-0 rounded-full"
                        style={{ background: SOURCE_COLOR[e.source] }}
                      />
                      <span className="min-w-0">
                        <span className="text-ink">{SOURCE_LABEL[e.source] ?? e.source}</span>
                        <span className="block text-ink-faint">{e.note}</span>
                      </span>
                    </li>
                  ))}
                {!d.measurable_from_music && (
                  <li className="text-[12px] text-ink-faint">Music can&rsquo;t show this; only you can.</li>
                )}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
