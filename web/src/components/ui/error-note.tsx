import { cn } from "@/lib/cn";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3.5 rounded-[1.125rem] bg-danger/[0.07] px-5 py-4 text-[14px] leading-relaxed text-ink shadow-[inset_0_0_0_1px_rgb(255_107_107/0.22)]",
        className,
      )}
    >
      <AlertCircle className="mt-[3px] size-4 shrink-0 text-danger" />
      <div>{children}</div>
    </div>
  );
}
