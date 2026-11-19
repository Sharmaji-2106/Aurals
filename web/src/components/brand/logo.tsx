import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useId } from "react";

/**
 * The signal mark: the nine frequency bands as bars around the listener, their
 * heights tracing a sound signature, stroked with the spectral scale. Kept as
 * the product's secondary mark — it stands for the measurement — while the
 * drawn AURALS wordmark is the brand.
 */
const INNER_RADIUS = 3.9;
const BARS = (() => {
  // A signature shape, not data: weight in the low bands, falling through the mids,
  // lifting again in the treble. The spread is wide on purpose — at 24px a narrow
  // range reads as a loading spinner rather than a spectrum.
  const heights = [5.0, 3.2, 2.0, 1.5, 2.4, 4.2, 2.9, 1.7, 3.6];
  return heights.map((height, i) => {
    const angle = (i / heights.length) * Math.PI * 2 - Math.PI / 2;
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    return {
      x1: +(12 + INNER_RADIUS * dx).toFixed(2),
      y1: +(12 + INNER_RADIUS * dy).toFixed(2),
      x2: +(12 + (INNER_RADIUS + height) * dx).toFixed(2),
      y2: +(12 + (INNER_RADIUS + height) * dy).toFixed(2),
    };
  });
})();

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="2" y1="20" x2="22" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff5238" />
          <stop offset="0.45" stopColor="#f5c678" />
          <stop offset="0.75" stopColor="#85cfe6" />
          <stop offset="1" stopColor="#a88cf6" />
        </linearGradient>
      </defs>
      {BARS.map((bar, i) => (
        <line
          key={i}
          x1={bar.x1}
          y1={bar.y1}
          x2={bar.x2}
          y2={bar.y2}
          stroke={`url(#${id})`}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    </svg>
  );
}

export { Wordmark };

/**
 * The header's logo: the drawn wordmark. On hover its ink turns to sunset foil,
 * as if the light had just caught it.
 */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("group relative inline-flex items-center text-ink", className)}
      aria-label="AURALS home"
    >
      <Wordmark className="h-[38px] w-auto transition-opacity duration-700 group-hover:opacity-0" title="" />
      <Wordmark
        tone="sunset"
        title=""
        className="absolute inset-0 h-[38px] w-auto opacity-0 transition-opacity duration-700 group-hover:opacity-100"
      />
    </Link>
  );
}
