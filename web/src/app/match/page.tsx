"use client";

import { FlowLoading, FlowShell } from "@/components/flow/flow-shell";
import { useRequiredSession } from "@/components/flow/use-session";
import { ErrorNote } from "@/components/ui/error-note";
import { Results } from "@/components/match/results";
import { useMusicProfile, useSoundProfile } from "@/lib/api/hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The moment the journey pays off.
 *
 * Composed as a sequence of distinct rooms rather than a stack of cards: the
 * listener's own sound at full width, then the earphone that draws it, the
 * rest of the field as a ranked index, the community, the music it all came
 * from, and only then the measurements. Each has its own composition so the
 * page has a rhythm instead of one repeated shape.
 *
 * Everything shown is produced by the engine or stored on the profile. Most of
 * the catalogue has no product photograph, so those earphones are drawn from
 * their own measured response instead — see `results/iem-portrait`.
 */

export default function MatchPage() {
  const session = useRequiredSession();
  const sound = useSoundProfile(session.ready);
  const music = useMusicProfile(session.ready);
  const router = useRouter();
  const nothingYet = sound.isSuccess && sound.data === null;

  useEffect(() => {
    if (nothingYet) router.replace("/music");
  }, [nothingYet, router]);

  const error = sound.error ?? music.error;
  return (
    <FlowShell step="match" bleed>
      {error ? (
        <div className="shell pt-14">
          <ErrorNote>{error.message}</ErrorNote>
        </div>
      ) : !session.me || sound.isPending || music.isPending || !sound.data ? (
        <FlowLoading label="Measuring the catalogue against your line" />
      ) : (
        <Results me={session.me} sound={sound.data} music={music.data ?? null} />
      )}
    </FlowShell>
  );
}
