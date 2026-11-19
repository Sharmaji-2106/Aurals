"use client";

import { CARD_SECONDS } from "@/components/book/contract";
import { DEMO_FEATURE } from "@/components/book/edition";
import { EditionPlayer } from "@/components/book/edition-player";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/** The Sound Card's stage: three.js and fonts, browser only like the book. */
const SoundCardSection = dynamic(
  () => import("@/components/card/sound-card-section").then((m) => m.SoundCardSection),
  {
    ssr: false,
    loading: () => <section className="min-h-[calc(100dvh-4rem)] w-full" data-section="sound-card" />,
  },
);

/**
 * The real page underneath, also client-only: `/match` itself renders its
 * results only once their data has arrived in the browser, and so does this.
 */
const SampleMatch = dynamic(() => import("@/components/book/sample-match").then((m) => m.SampleMatch), {
  ssr: false,
});

/** `?sheet`: every page flat, for proofreading. */
const PageSheet = dynamic(() => import("@/components/book/page-sheet").then((m) => m.PageSheet), {
  ssr: false,
});

/**
 * The Book studio.
 *
 * An isolated route for the cinematic edition, so it can be watched, scrubbed
 * and measured without going through onboarding first. It plays the sample
 * listener's edition over the real `/match` page printed for them. A
 * listener's own edition (`/edition`) is the same player with their data.
 */
export default function BookStudioPage() {
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    // Read once on arrival; the proof sheet is a different view, not a mode.
    const id = requestAnimationFrame(() =>
      setSheet(new URLSearchParams(window.location.search).has("sheet")),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  if (sheet) return <PageSheet />;
  return (
    <EditionPlayer
      feature={DEMO_FEATURE}
      studio
      page={({ time, interactive }) => (
        <SampleMatch
          lead={
            <SoundCardSection
              slug="neon-odyssey"
              time={Math.min(time, CARD_SECONDS)}
              interactive={interactive}
            />
          }
        />
      )}
    />
  );
}
