"use client";

import type { Stage } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { Check, X } from "lucide-react";
import { motion } from "motion/react";

const LABELS: Record<Stage["key"], string> = {
  resolve: "Finding",
  select: "Curating",
  analyze: "Measuring",
  profile: "Signature",
};

/** The pipeline as a quiet horizontal timeline under the stage. */
export function Stepper({ stages }: { stages: Stage[] }) {
  return (
    <ol className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
      {stages.map((stage, i) => (
        <li key={stage.key} className="relative pt-5">
          <span className="absolute inset-x-0 top-0 h-px bg-white/10">
            <motion.span
              className={cn(
                "absolute inset-y-0 left-0",
                stage.state === "failed" ? "bg-danger" : "rule-spectral",
              )}
              initial={false}
              animate={{
                width:
                  stage.state === "done" || stage.state === "failed"
                    ? "100%"
                    : stage.state === "active"
                      ? "45%"
                      : "0%",
              }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
          <span className="folio block">0{i + 1}</span>
          <p
            className={cn(
              "mt-2 flex items-center gap-2 font-display text-[1.375rem] leading-none",
              stage.state === "pending" ? "text-ink-faint" : "text-ink",
            )}
          >
            {stage.state === "done" && <Check className="size-3.5 text-ink-muted" strokeWidth={2.5} />}
            {stage.state === "failed" && <X className="size-3.5 text-danger" strokeWidth={2.5} />}
            {stage.state === "active" && (
              <span className="relative grid size-3.5 place-items-center">
                <span className="absolute size-3 animate-ping rounded-full bg-ember/40" />
                <span className="size-1.5 rounded-full bg-ember" />
              </span>
            )}
            {LABELS[stage.key]}
          </p>
          <p className="numeric mt-2 min-h-4 text-[11px] leading-relaxed text-ink-faint">{stage.detail}</p>
        </li>
      ))}
    </ol>
  );
}
