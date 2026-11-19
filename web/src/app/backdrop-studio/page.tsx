"use client";

import { ProductArt } from "@/components/results/product-art";
import type { Recommendation } from "@/lib/api/client";
import { usePalette } from "@/lib/palette";
import sample from "./sample.json";

/**
 * The backdrop studio: a sample of catalogue photographs on the backdrops their
 * own colours give them, with what the palette reader decided. For checking the
 * reader against real photographs, not for listeners.
 */
type Item = (typeof sample)[number];

function Tile({ item }: { item: Item }) {
  const palette = usePalette(`/api/iem-images/${item.image.path}`);
  return (
    <figure className="min-w-0">
      <div className="plinth relative aspect-[5/4] w-full overflow-hidden rounded-[1.4rem]">
        <ProductArt rec={item as unknown as Recommendation} />
      </div>
      <figcaption className="mt-2 flex items-center justify-between gap-3 text-[12px] text-ink-muted">
        <span className="truncate">
          {item.brand} {item.model}
        </span>
        <span className="numeric flex shrink-0 items-center gap-1.5 text-ink-faint">
          {palette?.kind ?? "…"}
          {palette && (
            <>
              <span className="size-3 rounded-full" style={{ background: palette.base }} />
              {palette.accent && (
                <span className="size-3 rounded-full" style={{ background: palette.accent }} />
              )}
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

export default function BackdropStudio() {
  return (
    <main className="shell py-14">
      <p className="eyebrow eyebrow-rule">Backdrop studio</p>
      <h1 className="marquee mt-5 text-[clamp(2.4rem,5vw,4rem)]">
        Each in its <em className="voice text-sunset">own colours</em>.
      </h1>
      <div className="mt-12 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {sample.map((item) => (
          <Tile key={item.slug} item={item} />
        ))}
      </div>
    </main>
  );
}
