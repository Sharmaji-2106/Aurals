"use client";

import { handoffAt } from "@/components/book/choreography";
import { T } from "@/components/book/contract";
import { IMAGES, type BookFeature, type Edition } from "@/components/book/edition";
import { finaleFrame, type Landing } from "@/components/book/finale";
import { pageSvg, type PageSpec, type Resolve } from "@/components/book/page-svg";
import { spreadLayout } from "@/components/book/choreography";
import { cn } from "@/lib/cn";
import { useMemo } from "react";

/**
 * The ending's overlay: the printed spread, the product, and the light.
 *
 * Everything here is a function of the clock, like the 3D part — so it scrubs,
 * replays and skips the same way. Three layers, positioned by `finale.ts`:
 *
 * 1. **The spread.** The same SVG that was printed on the 3D pages, laid
 *    exactly where the last 3D frame showed them, so the handoff is invisible.
 *    The camera then pushes into the photograph.
 * 2. **The light.** A wash the world changes colour through as the camera
 *    holds on the product: paper, the sunset it was read in, dusk, and the
 *    night the app is drawn in.
 * 3. **The product**, a cutout matted from the same photograph and registered
 *    to it pixel for pixel. It is the one element that survives every stage,
 *    and it gives way to the real product card's photograph — the same pixels
 *    — once that is under it.
 *
 * There is no recommendation interface here. What the camera pulls back to is
 * the real `/match` page, drawn underneath by the caller.
 */

function Svg({
  markup,
  className,
  style,
}: {
  markup: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("size-full [&>svg]:block [&>svg]:size-full", className)}
      style={style}
      // Generated in this module from the edition's own data; every string in
      // it is escaped by `pageSvg`.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export function FinalPage({
  time,
  edition,
  feature,
  resolve,
  viewport,
  landing,
}: {
  time: number;
  edition: Edition;
  feature: BookFeature;
  resolve: Resolve;
  viewport: { width: number; height: number };
  /** Where the real page's product photograph is; null until it is measured. */
  landing: Landing | null;
}) {
  const plateBare = useMemo<PageSpec>(
    () => ({
      ...edition.plate,
      id: "plate-bare",
      elements: edition.plate.elements.filter((e) => e.kind !== "image"),
    }),
    [edition],
  );
  const left = useMemo(() => pageSvg(edition.plate, resolve), [edition, resolve]);
  const leftBare = useMemo(() => pageSvg(plateBare, resolve), [plateBare, resolve]);
  const right = useMemo(() => pageSvg(edition.selected, resolve), [edition, resolve]);

  const { width, height } = viewport;
  const handoff = handoffAt(time);
  const frame = finaleFrame(time, viewport, edition, landing);
  const layout = spreadLayout(width, height);
  const { rect } = frame.product;
  // Until the light has changed, the overlay is opaque: it is the film. After
  // that, only what it still draws covers the page.
  const theme = time < T.theme[0] ? 0 : (time - T.theme[0]) / (T.theme[1] - T.theme[0]);
  const opaque = theme < 0.32;
  // Without a page to land on, the product stays: an ending, not a void.
  const keepProduct = !landing && time >= T.theme[1];

  if (frame.overlayDone && !keepProduct) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      style={{ opacity: handoff, background: opaque ? "#070a1a" : "transparent" }}
      aria-hidden="true"
      data-handoff={handoff.toFixed(3)}
    >
      {/* 1. The spread. Gone once the light has covered it. */}
      {frame.spread.opacity > 0 && (
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width,
            height,
            transform: frame.spread.transform,
            opacity: frame.spread.opacity,
            willChange: "transform",
          }}
          data-layer="spread"
        >
          <div
            className="absolute origin-right"
            style={{
              left: layout.gutter - layout.pageW,
              top: layout.top,
              width: layout.pageW,
              height: layout.pageH,
              transform: frame.spread.leftTransform,
            }}
            data-page="plate"
          >
            <Svg markup={left} className="absolute inset-0" style={{ opacity: 1 - frame.spread.swap }} />
            <Svg markup={leftBare} className="absolute inset-0" style={{ opacity: frame.spread.swap }} />
          </div>
          <div
            className="absolute"
            style={{ left: layout.gutter, top: layout.top, width: layout.pageW, height: layout.pageH }}
            data-page="selected"
          >
            <Svg markup={right} />
          </div>
        </div>
      )}

      {/* 2. The light the world changes through. */}
      <div
        className="absolute inset-0"
        style={{ opacity: keepProduct ? 1 : frame.wash.opacity, background: frame.wash.background }}
        data-layer="wash"
      />

      {/* 3. The product. Its studio shadow comes with it while it is still
          printed on paper, and goes when the paper does. */}
      {feature.plate && (frame.product.opacity > 0 || keepProduct) && (
        <div
          className="absolute"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          data-product={feature.slug}
        >
          {feature.shadow && (
            // eslint-disable-next-line @next/next/no-img-element -- registered to the pixel; must not be resized
            <img
              src={feature.shadow}
              alt=""
              className="absolute inset-0 size-full select-none"
              style={{ opacity: frame.spread.swap * frame.spread.opacity }}
              draggable={false}
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- registered to the printed photograph */}
          <img
            src={feature.cutout}
            alt={feature.plate ? IMAGES[feature.plate].alt : `${feature.brand} ${feature.model}`}
            className="absolute inset-0 size-full select-none"
            style={{ opacity: keepProduct ? 1 : frame.product.opacity }}
            draggable={false}
          />
          {/* A controlled highlight across the faceplates, masked to the product. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              opacity: Math.sin(Math.PI * frame.product.sheen) * 0.55 * frame.product.opacity,
              mixBlendMode: "screen",
              WebkitMaskImage: `url(${feature.cutout})`,
              maskImage: `url(${feature.cutout})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              background: `linear-gradient(112deg, transparent ${-22 + 130 * frame.product.sheen}%, rgb(255 240 228 / 0.75) ${-17 + 130 * frame.product.sheen}%, transparent ${-12 + 130 * frame.product.sheen}%)`,
            }}
          />
        </div>
      )}
    </div>
  );
}
