"use client";

import { loadEmbeds, type Embeds } from "@/components/book/assets";
import { DEMO_FEATURE, editionPages } from "@/components/book/edition";
import { pageSvg } from "@/components/book/page-svg";
import { useEffect, useMemo, useState } from "react";

/**
 * Every page of the edition, flat, in reading order: a proof sheet.
 *
 * The film shows most pages for well under a second, at an angle. This is
 * where their copy and layout are read and checked (`/book-studio?sheet`).
 */
export function PageSheet() {
  const edition = useMemo(() => editionPages(DEMO_FEATURE), []);
  const [embeds, setEmbeds] = useState<Embeds | null>(null);
  useEffect(() => {
    let live = true;
    void loadEmbeds().then((e) => live && setEmbeds(e));
    return () => {
      live = false;
    };
  }, []);
  if (!embeds) return <p className="p-8 font-mono text-[11px] text-ink-faint">Preparing the proof…</p>;

  // Spreads as a reader sees them: a leaf's back on the left, the next leaf's
  // front on the right.
  const spreads = [
    [null, edition.leaves[0].front],
    ...edition.leaves.slice(0, -1).map((leaf, i) => [leaf.back, edition.leaves[i + 1].front]),
    [edition.plate, edition.selected],
  ];
  return (
    <div className="grid gap-10 bg-[#0c0d14] p-8 sm:grid-cols-2" data-sheet>
      {spreads.map(([left, right], i) => (
        <figure key={i} className="flex flex-col gap-2">
          <figcaption className="font-mono text-[10px] tracking-[0.2em] text-ink-faint uppercase">
            Spread {i}
          </figcaption>
          <div className="grid grid-cols-2">
            {[left, right].map((page, k) =>
              page ? (
                <div
                  key={k}
                  className="aspect-[1000/1250] [&>svg]:block [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: pageSvg(page, embeds.dom) }}
                />
              ) : (
                <div key={k} className="aspect-[1000/1250] bg-[#151A3E]" />
              ),
            )}
          </div>
        </figure>
      ))}
    </div>
  );
}
