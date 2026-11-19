"use client";

import { IemPortrait } from "@/components/results/iem-portrait";
import type { Recommendation } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { usePalette } from "@/lib/palette";

/**
 * How an earphone is pictured.
 *
 * Where a real photograph has been gathered, that photograph is what you see,
 * standing on a backdrop in its own colours: the hue of its shell and
 * faceplate, read from the photograph's pixels (`lib/palette`), lighter and
 * quieter so the product still stands out. A photograph on a white studio
 * sweep is multiplied into that backdrop so its white becomes the backdrop; a
 * cutout stands on it with a soft shadow; a photograph taken in a setting is
 * shown as it was taken, framed by it. The product's pixels are only ever
 * re-coloured per pixel, never redrawn, because an invented detail on a
 * product photograph is a lie about hardware.
 *
 * Where no photograph exists, it falls back to the drawing made from the
 * earphone's own measured response, and says that is what it is. A listener is
 * never left to assume a generated shape is a picture of the product.
 */

/** Before the photograph has been read: a neutral sweep, never a house colour. */
const NEUTRAL = "radial-gradient(120% 85% at 50% 0%, #f5f2ed 0%, #e6e1d9 58%, #cfc8be 100%)";

export function ProductArt({
  rec,
  className,
  intensity = 1,
  animate = true,
}: {
  rec: Recommendation;
  className?: string;
  intensity?: number;
  /** Passed through to the drawing. See `IemPortrait` for why it is optional. */
  animate?: boolean;
}) {
  const image = rec.image;

  if (!image) {
    return (
      <div className={cn("absolute inset-0", className)}>
        <IemPortrait recommendation={rec} intensity={intensity} animate={animate} />
      </div>
    );
  }

  return (
    <Photograph
      path={image.path}
      alt={`${rec.brand} ${rec.model}`}
      intensity={intensity}
      className={className}
    />
  );
}

/**
 * A catalogue photograph on a backdrop in its own colours. Shared by the results
 * and the store, so a product looks the same wherever it is shown.
 */
export function Photograph({
  path,
  alt,
  intensity = 1,
  className,
  inset = "inset-x-[7%] top-[17%] bottom-[7%]",
}: {
  path: string;
  alt: string;
  intensity?: number;
  className?: string;
  /** Where the backdrop sits inside its box. */
  inset?: string;
}) {
  const src = `/api/iem-images/${path}`;
  const palette = usePalette(src);
  // Until it has been read, a transparent PNG is assumed to be a cutout.
  const kind = palette?.kind ?? (/\.png$/i.test(path) ? "matte" : "studio");
  const shade = palette ? `color-mix(in oklab, ${palette.deep} 55%, transparent)` : "rgb(40 32 30 / 0.3)";

  return (
    <div className={cn("absolute inset-0", className)} data-backdrop={palette?.base ?? ""}>
      <div
        className={cn(
          "group/art absolute overflow-hidden rounded-[1.35rem] transition-shadow duration-700",
          inset,
        )}
        style={{
          boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.55), 0 26px 64px -30px ${palette ? palette.mid : "rgb(0 0 0 / 0.5)"}`,
        }}
      >
        <div aria-hidden="true" className="absolute inset-0" style={{ background: NEUTRAL }} />
        {/* The product's own colours, eased in once the photograph has been read. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 transition-opacity duration-700 ease-out"
          style={{
            opacity: palette ? 1 : 0,
            background: palette
              ? `radial-gradient(125% 92% at 50% 0%, ${palette.light} 0%, ${palette.mid} 64%, ${palette.deep} 150%)`
              : undefined,
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={cn(
            "relative size-full object-contain transition-transform duration-[1400ms] ease-(--ease-out-expo) group-hover/art:scale-[1.04]",
            kind === "scene" ? "p-[7%]" : "p-[10%]",
            kind === "studio" && "mix-blend-multiply",
          )}
          style={{
            filter:
              kind === "matte"
                ? `drop-shadow(0 18px 20px ${shade}) saturate(${0.92 + 0.08 * intensity})`
                : kind === "scene"
                  ? `drop-shadow(0 16px 26px ${shade})`
                  : `contrast(1.05) saturate(${0.9 + 0.1 * intensity})`,
          }}
        />
        {/* A soft floor beneath the product, in the backdrop's own shadow. */}
        {kind !== "scene" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[18%] bottom-[9%] h-[8%] rounded-[50%] blur-xl"
            style={{ background: shade, opacity: 0.6 }}
          />
        )}
        {/* Light passing over the sweep on hover. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.4)_50%,transparent_65%)] bg-[length:250%_100%] bg-[position:150%_0] opacity-0 transition-[background-position,opacity] duration-[1600ms] ease-(--ease-out-expo) group-hover/art:bg-[position:-50%_0] group-hover/art:opacity-100"
        />
      </div>
    </div>
  );
}

/**
 * Who to credit. Shown wherever a photograph is, because the person who took
 * it still owns it.
 */
export function ProductArtCredit({ rec, className }: { rec: Recommendation; className?: string }) {
  const image = rec.image;
  if (!image) return null;
  return (
    <p className={cn("text-[11px] leading-snug text-ink-faint", className)}>
      Photograph:{" "}
      {image.source_url ? (
        <a
          href={image.source_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline decoration-white/20 underline-offset-2 hover:text-ink"
        >
          {image.credit}
        </a>
      ) : (
        image.credit
      )}
    </p>
  );
}
