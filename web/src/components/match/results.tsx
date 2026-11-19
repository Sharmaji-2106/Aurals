"use client";

import { ownListener } from "@/components/card/listener";
import { Deeper } from "@/components/match/deeper";
import { MatchDetail } from "@/components/match/match-detail";
import { SectionIndex } from "@/components/match/section-index";
import { DeleteDataButton } from "@/components/profile/delete-dialog";
import { EvidenceGallery } from "@/components/results/evidence";
import { Fingerprint } from "@/components/results/fingerprint";
import { BudgetPicks, DriverPicks } from "@/components/results/picks";
import { Collection, nameParts, Spotlight } from "@/components/results/recommendations";
import { useCommunityResearch } from "@/components/results/use-research";
import { DrawnRule, Lines, Reveal } from "@/components/site/reveal";
import { ButtonLink } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import type { Me, MusicProfile, Recommendation, SoundProfile } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useRecommendations, useReviewCollections, useUpdateProfile } from "@/lib/api/hooks";
import { driverFit } from "@/lib/driver-fit";
import { plural } from "@/lib/format";
import { portrait } from "@/lib/portrait";
import { USE_CASE_TITLE } from "@/lib/use-cases";
import { ArrowRight, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

/** The Sound Card's stage: three.js and fonts, so browser only. */
const SoundCardSection = dynamic(
  () => import("@/components/card/sound-card-section").then((m) => m.SoundCardSection),
  { ssr: false, loading: () => <CardPlaceholder /> },
);

function CardPlaceholder() {
  return (
    <section className="min-h-[calc(100dvh-4rem)] w-full" data-section="sound-card" aria-hidden="true" />
  );
}

/**
 * The results of `/match`: the listener's Sound Card, the earphone that draws
 * their sound, the rest of the field, the community, the music, and the
 * measurements. No sequence plays over it: the page is the result.
 *
 * Lives here rather than in the route so the edition (`/book-studio`) can land
 * on this very tree instead of a copy of it. One switch exists for that:
 *
 * - `sample`: the page is a sample listener's, shown to whoever is watching.
 *   Saving to a shortlist stays in this page (it is not the viewer's profile to
 *   change), the delete-account control is not offered — the viewer's own
 *   session must never be one click from being deleted on someone else's page —
 *   and no community research is started on the viewer's account.
 */
export function Results({
  me,
  sound,
  music,
  sample = false,
  lead,
  card,
}: {
  me: Me;
  sound: SoundProfile;
  music: MusicProfile | null;
  sample?: boolean;
  /** Replaces the opening section (the listener's Sound Card) when given. */
  lead?: ReactNode;
  /** Drives the listener's Sound Card from another clock (their edition's film). */
  card?: { time: number; interactive: boolean };
}) {
  const recs = useRecommendations(sound.id, 9);
  const evidence = useReviewCollections();
  const updateProfile = useUpdateProfile();
  const [opened, setOpened] = useState<Recommendation | null>(null);

  // Community research runs behind the page and feeds its community section.
  // Held until the ranking has loaded: starting a run also ranks the catalogue
  // to snapshot it, and both at once make each slower.
  const research = useCommunityResearch(recs.isSuccess && !sample);

  const items = recs.data?.items ?? [];
  const [first, ...rest] = items;
  // Every earphone this page puts in front of the listener: the ranking and its picks.
  const matched = useMemo(() => {
    const all = [
      ...(recs.data?.items ?? []),
      ...(recs.data?.budget_picks?.items ?? []),
      ...(recs.data?.driver_picks ?? []).map((p) => p.item),
    ];
    return all.filter((r, i) => all.findIndex((x) => x.slug === r.slug) === i);
  }, [recs.data]);
  const researched = new Set(evidence.data?.items.map((i) => i.slug) ?? []);
  // A sample's shortlist is kept here: it is not the viewer's profile.
  const [localShortlist, setLocalShortlist] = useState<string[]>(me.profile.shortlist);
  const shortlist = sample ? localShortlist : me.profile.shortlist;
  const saved = useMemo(() => new Set(shortlist), [shortlist]);

  // The shortlist lives on the profile, so it survives a reload and follows the
  // account. Declared interest only — the recommender never reads it.
  const toggleSave = useCallback(
    (slug: string) => {
      const next = saved.has(slug) ? shortlist.filter((s) => s !== slug) : [...shortlist, slug];
      if (sample) setLocalShortlist(next);
      else updateProfile.mutate({ shortlist: next });
    },
    [shortlist, saved, updateProfile, sample],
  );

  // Close the technical readout with Escape, as every other overlay here does.
  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpened(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened]);

  const words = portrait(sound.data.dimensions);
  const told = [
    sound.data.sources.listening ? "what your ears chose" : null,
    sound.data.sources.questionnaire ? "your answers" : null,
  ].filter((s): s is string => s !== null);
  const toldWords = told.join(" and ");
  const basis = music
    ? music.origin === "genre_picks"
      ? `Read from ${plural(music.track_count, "song")} AURALS chose for ${(music.origin_genres ?? [])
          .map((g) => USE_CASE_TITLE[g]?.toLowerCase() ?? g)
          .join(
            " and ",
          )}, not your own playlist${told.length ? `, refined by ${toldWords}` : ""}. Add your music for a truer read.`
      : `Read from ${plural(music.track_count, "song")} you actually listen to${told.length ? `, refined by ${toldWords}` : ""}.`
    : told.length
      ? `Read from ${toldWords} alone, until you add music.`
      : "A neutral start.";
  const contexts = me.profile.use_cases.map((k) => USE_CASE_TITLE[k] ?? k);
  // The driver rule of thumb: from what they play and how their sound leans.
  const fit = driverFit(me.profile.use_cases, me.profile.primary_use_case, sound.data.dimensions);
  const opener = (rec: Recommendation) => setOpened((cur) => (cur?.slug === rec.slug ? null : rec));

  // The listener's own card, from the same live data as the rest of the page.
  // It needs their music (it is drawn from it) and the ranking (its best match).
  const recData = recs.data;
  const own = useMemo(
    () => (music && recData && !sample ? ownListener(me, sound, music, recData) : null),
    [me, sound, music, recData, sample],
  );

  return (
    <div className="flex flex-col pb-24">
      <SectionIndex />
      {/* 01 — the listener's Sound Card, made from their music — unless the
          caller leads with something else (the edition's sample card). */}
      {lead ??
        (own ? (
          <>
            <SoundCardSection listener={own} heading="h1" time={card?.time} interactive={card?.interactive} />
            <YourSound name={me.profile.display_name} basis={basis} words={words} />
          </>
        ) : music && !recs.error ? (
          <CardPlaceholder />
        ) : (
          <PlainLead name={me.profile.display_name} basis={basis} words={words} />
        ))}

      {/* 02 — the earphone that draws it. */}
      <div className="shell mt-24 sm:mt-32" data-section="match">
        {recs.error ? (
          <ErrorNote>{recs.error.message}</ErrorNote>
        ) : first ? (
          <Spotlight
            rec={first}
            saved={saved.has(first.slug)}
            onSave={() => toggleSave(first.slug)}
            hasEvidence={researched.has(first.slug)}
          />
        ) : recs.isPending ? (
          <div className="grid gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="skeleton aspect-[5/4] w-full rounded-[2rem]" />
            <div className="flex flex-col gap-5 pt-6">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-20 w-4/5 rounded-xl" />
              <div className="skeleton mt-6 h-40 w-full rounded-xl" />
            </div>
          </div>
        ) : null}

        {/* The top of the listener's price bracket, right under the #1. */}
        {recs.data?.budget_picks && first && (
          <BudgetPicks
            picks={recs.data.budget_picks}
            saved={saved}
            onSave={toggleSave}
            researched={researched}
            onOpen={opener}
          />
        )}

        {/* The best of the driver type that tends to suit how they listen. */}
        {recs.data?.driver_picks?.length ? (
          <DriverPicks
            picks={recs.data.driver_picks}
            fit={fit}
            onRecord={recs.data.drivers_on_record}
            eligible={recs.data.dataset.measurements}
            saved={saved}
            onSave={toggleSave}
            researched={researched}
            onOpen={opener}
          />
        ) : null}

        {/* Stated whether or not contexts were chosen: what orders these
            earphones is the measured response against this target, and the
            page should never leave that ambiguous. */}
        <div className="mt-14 grid gap-x-16 gap-y-4 border-t border-hairline pt-6 text-[12px] leading-relaxed text-ink-faint md:grid-cols-2">
          <p>
            Ranked on measured response against your target, plus at most three points of community standing
            (how widely it is stocked and recommended). What you listen to
            {contexts.length > 0 ? ` (${contexts.join(", ").toLowerCase()})` : ""} leans your target a little;
            wireless earbuds and anything without a verified price in your budget are left out.
          </p>
          {/* What the engine itself could not do, once — not as a banner at the top. */}
          {recs.data?.notes.length ? <p className="text-ink-muted">{recs.data.notes.join(" ")}</p> : null}
        </div>
      </div>

      {/* 03 — the rest of the field. */}
      {rest.length > 0 && (
        <section className="shell mt-24 sm:mt-32" data-section="field">
          <div className="grid items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div>
              <p className="eyebrow eyebrow-rule">The rest of the field</p>
              <h2 className="marquee mt-6 text-[clamp(2.6rem,6.2vw,6rem)]">
                <Lines onView>
                  <>Ranked against</>
                  <>
                    <em className="voice text-sunset">your line</em>.
                  </>
                </Lines>
              </h2>
            </div>
            <Reveal delay={0.15}>
              <p className="max-w-sm text-[14px] leading-relaxed text-ink-muted lg:pb-3">
                Every earphone AURALS holds a measurement for, scored by the Olive et al. in-ear model against
                your own target. Open one for what it trades away.
              </p>
            </Reveal>
          </div>
          <div className="mt-14 sm:mt-20">
            <Collection
              items={rest}
              saved={saved}
              onSave={toggleSave}
              researched={researched}
              onOpen={opener}
              openId={opened?.slug ?? null}
            />
          </div>
          {saved.size > 0 && (
            <p className="mt-8 text-[13px] text-ink-faint">
              {plural(saved.size, "earphone")} saved to your shortlist. It stays with your profile.
            </p>
          )}
        </section>
      )}

      {/* 04 — the music it all came from: the reason the ranking reads as it
          does, so it comes straight after the earphones. */}
      {music && <Fingerprint music={music} className="mt-24 sm:mt-32" />}

      {/* 05 — the community: what owners report, read after the measurements
          and the music rather than ahead of them. */}
      {evidence.data && (
        <EvidenceGallery
          collections={evidence.data.items}
          showcaseSlug={evidence.data.showcase_slug}
          ranked={matched}
          run={research}
          className="mt-24 sm:mt-32"
        />
      )}

      {/* 06 — under the surface: the measurements, for anyone who wants them. */}
      <section className="shell mt-24 sm:mt-32" data-section="numbers">
        <div className="grid items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow eyebrow-rule">Under the surface</p>
            <h2 className="marquee mt-6 text-[clamp(2.6rem,6.2vw,6rem)]">
              <Lines onView>
                <>Every number</>
                <>
                  <em className="voice text-sunset">behind</em> it.
                </>
              </Lines>
            </h2>
          </div>
          <Reveal delay={0.15}>
            <p className="max-w-sm text-[14px] leading-relaxed text-ink-muted lg:pb-3">
              None of this is needed to use the page above, and all of it is here.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 sm:mt-16">
          <Deeper sound={sound} music={music} />
        </div>

        <TechnicalRow
          sound={sound}
          first={first ?? null}
          contexts={contexts}
          driverPreference={me.profile.driver_preference}
          researched={researched}
          index={music ? "05" : "04"}
        />

        <div className="mt-14 flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
          <p className="numeric max-w-2xl text-[11px] leading-relaxed text-ink-faint">
            {recs.data
              ? `${recs.data.recommender} · profile ${recs.data.sound_profile_version} · ${recs.data.dataset.measurements} measured earphones · ${recs.data.dataset.sources.join(", ") || "no sources"} · ${recs.data.reference_target?.citation ?? "no reference target imported"}`
              : `Model ${sound.data.model_version}, relative to the Harman in-ear target.`}
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <ButtonLink href="/music" variant="secondary" size="sm">
              Add more music
            </ButtonLink>
            <ButtonLink href="/tune" variant="secondary" size="sm">
              Refine your sound
            </ButtonLink>
            <ButtonLink href="/method" variant="secondary" size="sm">
              Method
            </ButtonLink>
            {!sample && <DeleteDataButton />}
          </div>
        </div>
      </section>

      {/* An opened earphone gets the full technical readout, over the page. */}
      <AnimatePresence>
        {opened && (
          <motion.div
            key="detail"
            role="dialog"
            aria-modal="true"
            aria-label={`${opened.brand} ${opened.model}, in full`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-canvas/88 backdrop-blur-2xl"
            onClick={() => setOpened(null)}
          >
            <motion.div
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-10 sm:py-20"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className="eyebrow eyebrow-rule">
                    <span className="text-ember">{String(opened.rank).padStart(2, "0")}</span> In full
                  </p>
                  <h3 className="display mt-5 text-[clamp(2.2rem,5vw,4.5rem)] leading-[0.92]">
                    <span className="block text-[0.42em] leading-[1.1] text-ink-muted">
                      {nameParts(opened).lead}
                    </span>
                    <em className="text-ember-soft">{nameParts(opened).title}</em>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpened(null)}
                  aria-label="Close"
                  autoFocus
                  className="grid size-11 shrink-0 place-items-center rounded-full text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.13)] transition-[background-color,box-shadow,color,transform] duration-500 hover:rotate-90 hover:bg-white/[0.05] hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="surface mt-10 rounded-[1.75rem] p-6 sm:p-10">
                <MatchDetail
                  recommendation={opened}
                  sound={sound}
                  contexts={contexts}
                  driverPreference={me.profile.driver_preference}
                  hasEvidence={researched.has(opened.slug)}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The profile in words, each sentence chosen by thresholds on its numbers. */
function Words({ words }: { words: string[] }) {
  return (
    <ol
      className="mt-14 grid grid-cols-1 gap-x-12 gap-y-9 sm:mt-20 sm:grid-cols-[repeat(var(--traits),minmax(0,1fr))]"
      style={{ ["--traits" as string]: Math.max(1, words.length) }}
    >
      {words.map((sentence, i) => (
        <li key={sentence}>
          <DrawnRule delay={0.2 + i * 0.12} />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="pt-5"
          >
            <span className="folio">0{i + 1}</span>
            <p className="display mt-5 text-[clamp(1.75rem,2.6vw,2.5rem)] leading-[1.02] text-ink">
              {sentence}
            </p>
          </motion.div>
        </li>
      ))}
    </ol>
  );
}

/**
 * After the card: the sound the ranking actually uses. The card is drawn from
 * the music alone; the profile also carries the listening session and the
 * answers, and the page says which is which.
 */
function YourSound({ name, basis, words }: { name: string; basis: string; words: string[] }) {
  return (
    <section className="shell mt-16 sm:mt-24" data-section="your-sound">
      <div className="grid items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow eyebrow-rule">{name}&rsquo;s sound</p>
          <h2 className="marquee mt-6 text-[clamp(2.4rem,5.4vw,5rem)]">
            <Lines onView>
              <>What your</>
              <>
                sound <em className="voice text-sunset">asks for</em>.
              </>
            </Lines>
          </h2>
        </div>
        <Reveal delay={0.15}>
          <p className="max-w-sm text-[14px] leading-relaxed text-ink-muted lg:pb-3">
            {basis} The card is drawn from your music alone; the earphones below are ranked on all of it.
          </p>
        </Reveal>
      </div>
      <Words words={words} />
    </section>
  );
}

/** Without music there is no card to make: the profile in words, and the way to one. */
function PlainLead({ name, basis, words }: { name: string; basis: string; words: string[] }) {
  return (
    <section className="relative isolate pt-12 sm:pt-20" data-section="your-sound">
      <div className="shell grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="eyebrow eyebrow-rule"
          >
            {name}&rsquo;s sound
          </motion.p>
          <h1 className="marquee mt-6 text-[clamp(3.1rem,8.4vw,8.5rem)]">
            <Lines stagger={0.12}>
              <>Your sound has</>
              <>
                a <em className="voice text-sunset">signature</em>.
              </>
            </Lines>
          </h1>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.35 }}
          className="min-w-0 lg:pb-4"
        >
          <p className="lede max-w-md">
            {basis} This is the shape AURALS found in it, and the earphones that draw the same one.
          </p>
        </motion.div>
      </div>
      <div className="shell">
        <Words words={words} />
        <div className="surface-quiet mt-14 flex flex-col gap-5 rounded-[1.5rem] p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            Your music is the strongest evidence AURALS can use. Right now this rests on what you told it
            alone — add a playlist and the whole page is redrawn from what you actually listen to, with a
            Sound Card made from it.
          </p>
          <ButtonLink href="/music" className="shrink-0 self-start sm:self-auto">
            Add your music <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

/** The top match's own measurements, folded away until asked for. */
function TechnicalRow({
  sound,
  first,
  contexts,
  driverPreference,
  researched,
  index,
}: {
  sound: SoundProfile;
  first: Recommendation | null;
  contexts: string[];
  driverPreference: string | null;
  researched: Set<string>;
  index: string;
}) {
  const [open, setOpen] = useState(false);
  if (!first) return null;
  return (
    <div className="border-b border-hairline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-7 text-left sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
      >
        <span
          className={cn("folio transition-colors duration-500 group-hover:text-ember", open && "text-ember")}
        >
          {index}
        </span>
        <span className="min-w-0">
          <span className="display block text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.05] text-ink">
            Measurements for the {first.brand} {first.model}
          </span>
          <span className="mt-2 block text-[13px] text-ink-faint">
            Your target against its measured response, region by region, and what the measurement rests on.
          </span>
        </span>
        <Plus
          className={cn(
            "size-5 shrink-0 self-center text-ink-muted transition-transform duration-700 ease-(--ease-out-expo) group-hover:text-ink",
            open && "rotate-45",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-12 sm:pl-[5rem]">
              <MatchDetail
                recommendation={first}
                sound={sound}
                contexts={contexts}
                driverPreference={driverPreference}
                hasEvidence={researched.has(first.slug)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
