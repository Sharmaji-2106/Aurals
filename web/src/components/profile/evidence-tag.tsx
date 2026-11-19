import { cn } from "@/lib/cn";
import { evidenceLabel, evidenceLevel, levelDots, type Basis, type Level } from "@/lib/evidence";

/** Three quiet dots: how much evidence stands behind a value. */
export function EvidenceDots({ level, className }: { level: Level; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} aria-hidden="true">
      {levelDots(level).map((on, i) => (
        <span
          key={i}
          className={cn("size-[5px] rounded-full", on ? "bg-ink-muted" : "border border-white/20")}
        />
      ))}
    </span>
  );
}

/** Evidence level as dots plus words, never as a percentage. */
export function EvidenceTag({ basis, className }: { basis: Basis; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[12px] text-ink-faint", className)}>
      <EvidenceDots level={evidenceLevel(basis)} />
      {evidenceLabel(basis)}
    </span>
  );
}
