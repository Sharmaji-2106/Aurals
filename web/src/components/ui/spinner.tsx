import { cn } from "@/lib/cn";

/** Four bars breathing out of phase: a tiny equaliser. */
export function EqualizerSpinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex h-3.5 items-end gap-[3px]", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-current"
          style={{
            height: "100%",
            animation: `eq-bar 0.9s ${i * 0.12}s cubic-bezier(0.76, 0, 0.24, 1) infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}
