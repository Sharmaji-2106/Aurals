import { cn } from "@/lib/cn";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { EqualizerSpinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/*
 * A trailing arrow leans into the direction of travel on hover. It is the icon
 * that moves, never the label, so the button's width is stable.
 */
const base =
  "group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium " +
  "transition-[background-color,color,border-color,transform,box-shadow,opacity] duration-500 ease-(--ease-out-expo) " +
  "active:scale-[0.98] active:duration-150 disabled:pointer-events-none disabled:opacity-40 " +
  "[&_svg]:transition-transform [&_svg]:duration-500 [&_svg]:ease-(--ease-out-expo) " +
  "[&:hover_.lucide-arrow-right]:translate-x-[3px] [&:hover_.lucide-arrow-left]:-translate-x-[3px]";

const variants: Record<Variant, string> = {
  // Champagne: warm ivory lit along its top edge, a soft peach glow beneath.
  // On hover a slow sheen crosses it — light, not colour, is what changes.
  primary:
    "bg-[linear-gradient(105deg,#fdf3e7_0%,#f3dcc4_45%,#fdf3e7_55%,#efd3bb_100%)] bg-[length:240%_100%] bg-[position:0%_0] text-[#1b1220] " +
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.9),inset_0_-1px_0_rgb(120_80_60/0.18),0_0_0_1px_rgb(255_236_222/0.18),0_12px_32px_-14px_rgb(235_170_154/0.55)] " +
    "transition-[background-position,transform,box-shadow,opacity] duration-[1100ms] hover:-translate-y-px hover:bg-[position:100%_0] " +
    "hover:shadow-[inset_0_1px_0_rgb(255_255_255/1),inset_0_-1px_0_rgb(120_80_60/0.18),0_0_0_1px_rgb(255_236_222/0.3),0_18px_42px_-14px_rgb(235_170_154/0.75)]",
  // Glass: the scene shows through it.
  secondary:
    "border border-white/14 bg-white/[0.05] text-ink backdrop-blur-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] " +
    "hover:border-white/30 hover:bg-white/[0.1]",
  ghost: "text-ink-muted hover:bg-white/[0.045] hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-[15px] tracking-[-0.005em]",
};

type Common = { variant?: Variant; size?: Size; loading?: boolean; children: ReactNode };

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: Common & ComponentProps<"button">) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "opacity-0")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <EqualizerSpinner />
        </span>
      )}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Omit<Common, "loading"> & ComponentProps<typeof Link>) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </Link>
  );
}
