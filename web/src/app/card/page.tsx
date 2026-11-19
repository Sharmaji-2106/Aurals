"use client";

import { ownListener } from "@/components/card/listener";
import { FlowLoading, FlowShell } from "@/components/flow/flow-shell";
import { useRequiredSession } from "@/components/flow/use-session";
import { ButtonLink } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { useMusicProfile, useRecommendations, useSoundProfile } from "@/lib/api/hooks";
import { ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const SoundCardSection = dynamic(
  () => import("@/components/card/sound-card-section").then((m) => m.SoundCardSection),
  { ssr: false, loading: () => <section className="min-h-[calc(100dvh-4rem)] w-full" aria-hidden="true" /> },
);

/**
 * The listener's own Sound Card, on a page of its own.
 *
 * It is what the code on the back of the card opens. The code holds only this
 * address — nothing about the listener — and the page needs their session, so
 * someone else scanning it reaches the start of AURALS, not this card.
 */
export default function CardPage() {
  const session = useRequiredSession();
  const sound = useSoundProfile(session.ready);
  const music = useMusicProfile(session.ready);
  // The same query `/match` makes, so the two pages share one ranking.
  const recs = useRecommendations(sound.data?.id, 9);

  const listener = useMemo(
    () =>
      session.me && sound.data && music.data && recs.data
        ? ownListener(session.me, sound.data, music.data, recs.data)
        : null,
    [session.me, sound.data, music.data, recs.data],
  );

  const error = sound.error ?? music.error ?? recs.error;
  const noMusic = music.isSuccess && music.data === null;
  const noSound = sound.isSuccess && sound.data === null;

  return (
    <FlowShell step="match" bleed>
      {error ? (
        <div className="shell pt-14">
          <ErrorNote>{error.message}</ErrorNote>
        </div>
      ) : noMusic || noSound ? (
        <section className="shell pt-14 sm:pt-24">
          <p className="eyebrow eyebrow-rule">Your Sound Card</p>
          <h1 className="marquee mt-6 text-[clamp(2.8rem,7vw,6.5rem)]">
            Made from <em className="voice text-sunset">your music</em>.
          </h1>
          <p className="lede mt-6 max-w-xl">
            A Sound Card is drawn from the songs you actually listen to, so there is nothing to draw yet. Add
            a playlist and AURALS makes yours.
          </p>
          <ButtonLink href="/music" className="mt-9">
            Add your music <ArrowRight className="size-4" />
          </ButtonLink>
        </section>
      ) : !listener ? (
        <FlowLoading label="Drawing your Sound Card" />
      ) : (
        <>
          <SoundCardSection listener={listener} heading="h1" />
          <div className="shell flex flex-wrap gap-2 pb-24">
            <ButtonLink href="/match" variant="secondary" size="sm">
              Your matches <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </>
      )}
    </FlowShell>
  );
}
