"use client";

import { engrave, type Engraving } from "@/components/card/artwork";
import { commission, FINISH_IDS, rankFinishes, type ArtDirection } from "@/components/card/commission";
import { LISTENERS, library, type Library } from "@/components/card/listener";
import { Proof } from "@/components/card/proof";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CardStudioStage = dynamic(
  () => import("@/components/card/card-studio-stage").then((m) => m.CardStudioStage),
  {
    ssr: false,
  },
);

/**
 * The Sound Card studio.
 *
 * - The lineup: every prepared listener's matched card, front and back. If a
 *   stranger cannot tell them apart, the Commission needs more measured
 *   dimensions — not more animation.
 * - Every finish: one listener's card in each of the fourteen stocks
 *   (`?listener=slug`, default the demo listener).
 * - `?stage=slug` opens the 3D reveal on its own, with a transport.
 */

type Made = { lib: Library; art: ArtDirection; engraving: Engraving };

export default function CardStudioPage() {
  const [lineup, setLineup] = useState<Made[]>([]);
  const [finishes, setFinishes] = useState<Made[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const wanted = params.get("stage");
        if (live) setStage(wanted);
        const url = (slug: string) => `${window.location.origin}/edition/${slug}`;
        const out: Made[] = [];
        for (const entry of LISTENERS.filter((l) => !wanted || l.slug === wanted)) {
          const lib = library(entry, await entry.load());
          const art = commission(lib);
          out.push({ lib, art, engraving: await engrave({ lib, art, editionUrl: url(entry.slug) }) });
        }
        if (live) setLineup(out);
        if (wanted) return;
        const who =
          LISTENERS.find((l) => l.slug === (params.get("listener") ?? "neon-odyssey")) ?? LISTENERS[0];
        const lib = library(who, await who.load());
        const all: Made[] = [];
        for (const id of FINISH_IDS) {
          const art = commission(lib, id);
          all.push({ lib, art, engraving: await engrave({ lib, art, editionUrl: url(who.slug) }) });
        }
        if (live) setFinishes(all);
      } catch (error) {
        if (live) setFailure(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (stage && lineup[0]) return <CardStudioStage engraving={lineup[0].engraving} art={lineup[0].art} />;

  const matched = finishes[0] ? rankFinishes(finishes[0].lib)[0] : null;

  return (
    <main
      className="min-h-dvh px-6 py-10 text-ink"
      data-lineup={lineup.length}
      data-finishes={finishes.length}
    >
      <h1 className="eyebrow">Sound Card · lineup</h1>
      {failure && <p className="mt-6 text-[13px] text-danger">{failure}</p>}
      <div className="mt-8 grid gap-12 xl:grid-cols-2">
        {lineup.map(({ lib, art, engraving }) => (
          <section key={lib.slug} className="flex flex-col gap-4" data-card={lib.slug}>
            <header className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-ink-muted">
              <span className="text-ink">{lib.title}</span>
              <span>
                {art.name} · {art.material} · {lib.trackCount} tracks
              </span>
            </header>
            <div className="grid grid-cols-2 gap-4">
              <Proof engraving={engraving} art={art} side="front" className="w-full rounded-[18px]" />
              <Proof engraving={engraving} art={art} side="back" className="w-full rounded-[18px]" />
            </div>
            <ul className="text-[11px] leading-relaxed text-ink-faint">
              {art.colophon.map((c) => (
                <li key={c.decision}>
                  <span className="text-ink-muted">{c.decision}</span> — {c.because}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {finishes.length > 0 && (
        <>
          <h2 className="eyebrow mt-20">Every finish · {finishes[0].lib.title}</h2>
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4 xl:grid-cols-7" data-finish-gallery="">
            {finishes.map(({ art, engraving }) => (
              <figure key={art.family} className="flex flex-col gap-2" data-finish={art.family}>
                <Proof engraving={engraving} art={art} side="front" className="w-full rounded-[14px]" />
                <figcaption className="text-[11px] leading-snug text-ink-muted">
                  <span className="text-ink">{art.name}</span>
                  {art.family === matched ? " · matched" : ""}
                  <br />
                  {art.material} · {art.mood}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
