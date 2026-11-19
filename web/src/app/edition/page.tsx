"use client";

import { EditionPlayer } from "@/components/book/edition-player";
import { prepareFeature } from "@/components/book/live-feature";
import { listenerRun, type BookRun } from "@/components/book/run";
import { ownListener } from "@/components/card/listener";
import type { BookFeature } from "@/components/book/edition";
import { FlowShell } from "@/components/flow/flow-shell";
import { useRequiredSession } from "@/components/flow/use-session";
import { Results } from "@/components/match/results";
import { useMusicProfile, useRecommendations, useSoundProfile } from "@/lib/api/hooks";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * The listener's own Listening Edition: the book, printed for them.
 *
 * Its editorial pages are the same for everyone. The pages about a listener's
 * music, profile and shortlist print theirs, and the last spread is the
 * earphone the engine ranked first for them — its catalogue photograph on
 * paper in its own colours, or, where the catalogue has no photograph, a page
 * that says so. The film ends on their real results, which is where the
 * address then points (`/match`), so a refresh lands there rather than
 * replaying the film.
 *
 * Without music there is nothing for the book's music pages to print, so a
 * listener without it goes straight to their results.
 */
export default function EditionPage() {
  const session = useRequiredSession();
  const sound = useSoundProfile(session.ready);
  const music = useMusicProfile(session.ready);
  const recs = useRecommendations(sound.data?.id, 9);
  const router = useRouter();
  const [prepared, setPrepared] = useState<{ feature: BookFeature; run: BookRun } | null>(null);
  const [failed, setFailed] = useState(false);

  const me = session.me;
  const noBook =
    (music.isSuccess && music.data === null) ||
    (sound.isSuccess && sound.data === null) ||
    Boolean(sound.error ?? music.error ?? recs.error) ||
    failed ||
    (recs.isSuccess && recs.data.items.length === 0);

  useEffect(() => {
    if (noBook) router.replace("/match");
  }, [noBook, router]);

  useEffect(() => {
    if (prepared || !me || !sound.data || !music.data || !recs.data?.items.length) return;
    let live = true;
    const own = ownListener(me, sound.data, music.data, recs.data);
    const run = listenerRun(own.snapshot, music.data.playlist_title ?? null);
    prepareFeature(recs.data.items[0], run)
      .then(({ feature }) => live && setPrepared({ feature, run }))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [prepared, me, sound.data, music.data, recs.data]);

  // The film has handed over: the address becomes the page it landed on.
  const landed = useCallback(() => window.history.replaceState(null, "", "/match"), []);

  if (!prepared || !me || !sound.data) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-[#080a1b]">
        <div className="text-center">
          <p
            className="font-book-script text-[44px] leading-none"
            style={{
              background: "linear-gradient(90deg, #f0a7b8, #ebb09c, #dcb772)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Aurals
          </p>
          <p className="mt-3 font-mono text-[9.5px] tracking-[0.32em] text-[#F1E5D1]/40 uppercase">
            Printing your edition
          </p>
        </div>
      </div>
    );
  }

  return (
    <EditionPlayer
      feature={prepared.feature}
      run={prepared.run}
      onFinished={landed}
      page={(card) => (
        <FlowShell step="match" bleed scene={false}>
          <Results me={me} sound={sound.data!} music={music.data ?? null} card={card} />
        </FlowShell>
      )}
    />
  );
}
