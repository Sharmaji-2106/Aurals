"use client";

import { FlowLoading, FlowShell } from "@/components/flow/flow-shell";
import { useRequiredSession } from "@/components/flow/use-session";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { UseCaseCard } from "@/components/world/use-case-card";
import type { Me } from "@/lib/api/client";
import { useSoundProfile, useUpdateProfile } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { DRIVER_BLURB, DRIVER_NAME, driverFit } from "@/lib/driver-fit";
import {
  DRIVER_PREFERENCES,
  USE_CASES,
  type DriverPreference,
  type UseCaseGroup,
  type UseCaseKey,
} from "@/lib/use-cases";
import { ArrowRight, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WorldPage() {
  const session = useRequiredSession();
  return (
    <FlowShell step="world" wide fit>
      {!session.ready || !session.me ? <FlowLoading /> : <World me={session.me} />}
    </FlowShell>
  );
}

const GROUPS: { key: UseCaseGroup; label: string; cols: string }[] = [
  { key: "music", label: "What you play", cols: "sm:grid-cols-4 lg:grid-cols-7" },
  { key: "life", label: "Where you listen", cols: "sm:grid-cols-3 lg:grid-cols-6" },
];
const ease = [0.16, 1, 0.3, 1] as const;

function World({ me }: { me: Me }) {
  const router = useRouter();
  const save = useUpdateProfile();
  const sound = useSoundProfile();
  const [chosen, setChosen] = useState<UseCaseKey[]>(me.profile.use_cases);
  const [primary, setPrimary] = useState<UseCaseKey | null>(me.profile.primary_use_case);
  const [driver, setDriver] = useState<DriverPreference>(me.profile.driver_preference ?? "none");

  // The rule of thumb, live: what the cards and the listener's own sound point to.
  const fit = driverFit(chosen, primary, sound.data?.data.dimensions);

  const toggle = (key: UseCaseKey) => {
    setChosen((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      if (!next.includes(key) && primary === key) setPrimary(null);
      if (next.length === 1) setPrimary(next[0]);
      return next;
    });
  };

  const finish = (keep: boolean) => {
    const body = keep
      ? {
          use_cases: chosen,
          primary_use_case: chosen.length > 1 ? primary : (chosen[0] ?? null),
          driver_preference: driver,
        }
      : { use_cases: [], primary_use_case: null, driver_preference: null };
    // Listeners with music get their edition first; it ends on their results.
    save.mutate(body, { onSuccess: () => router.push("/edition") });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid shrink-0 items-end gap-x-16 gap-y-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
      >
        <div>
          <p className="eyebrow eyebrow-rule">Almost there</p>
          <h1 className="marquee mt-2 text-[clamp(1.6rem,4.2vw,3.6rem)] sm:mt-3">
            Where does your sound <em className="voice text-sunset">live</em>?
          </h1>
        </div>
        <p className="max-w-md text-[13px] leading-snug text-ink-muted sm:text-[14px] sm:leading-relaxed lg:pb-2">
          Pick as many as fit. What you play leans your sound a little — your music, answers and ears outweigh
          it — and the ranking still comes from measured frequency response.
        </p>
      </motion.header>

      {/* Two rows that share whatever height is left: the cards size to it. */}
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-y-1.5 sm:gap-y-2">
        {GROUPS.map((group) => (
          <Group key={group.key} label={group.label}>
            <div className={cn("grid min-h-0 grid-cols-2 gap-1.5 sm:gap-2.5", group.cols)}>
              {USE_CASES.filter((u) => u.group === group.key).map((useCase) => (
                <motion.div
                  key={useCase.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.08 + USE_CASES.indexOf(useCase) * 0.035, ease }}
                  className="min-h-[7.5rem]"
                >
                  <UseCaseCard
                    title={useCase.title}
                    wants={useCase.wants}
                    motif={useCase.motif}
                    selected={chosen.includes(useCase.key)}
                    primary={primary === useCase.key && chosen.length > 1}
                    onToggle={() => toggle(useCase.key)}
                    dense
                  />
                </motion.div>
              ))}
            </div>
          </Group>
        ))}
      </div>

      {/* Both refinements in place. Neither grows the page: the "most
          important" group only exists once there is a choice to make. */}
      <div className="grid shrink-0 gap-3 border-t border-hairline pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-2">
          <AnimatePresence initial={false}>
            {chosen.length > 1 && (
              <motion.div
                key="primary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex min-w-0 flex-wrap items-center gap-1.5"
              >
                <span className="eyebrow mr-1">Most</span>
                {USE_CASES.filter((u) => chosen.includes(u.key)).map((u) => (
                  <Chip
                    key={u.key}
                    on={primary === u.key}
                    onClick={() => setPrimary(primary === u.key ? null : u.key)}
                  >
                    {u.title}
                  </Chip>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
              className="eyebrow mr-1"
              title="Driver type is a specification, not a sound. AURALS ranks on what was measured, never on what a product is made of."
            >
              Built like
            </span>
            {DRIVER_PREFERENCES.map((option) => (
              <Chip
                key={option.key}
                on={driver === option.key}
                onClick={() => setDriver(option.key)}
                title={option.note}
                hint={fit?.category === option.key}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
        <DriverHint fit={fit} onUse={() => fit && setDriver(fit.category)} using={driver === fit?.category} />
      </div>

      {save.error && <ErrorNote className="shrink-0">{save.error.message}</ErrorNote>}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <ButtonLink href="/tune" variant="ghost" size="sm">
          Back
        </ButtonLink>
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => finish(false)} disabled={save.isPending}>
            Skip
          </Button>
          <Button size="md" onClick={() => finish(true)} loading={save.isPending}>
            See my sound <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <p className="eyebrow flex items-center gap-3 text-[10px]">
        {label}
        <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
      </p>
      {children}
    </>
  );
}

/** The rule of thumb, said as one. Updates as cards are chosen. */
function DriverHint({
  fit,
  onUse,
  using,
}: {
  fit: ReturnType<typeof driverFit>;
  onUse: () => void;
  using: boolean;
}) {
  return (
    <div className="relative min-h-[4.25rem] overflow-hidden rounded-2xl bg-white/[0.03] px-4 py-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
      <AnimatePresence mode="wait" initial={false}>
        {fit ? (
          <motion.div
            key={fit.category + fit.because.join()}
            initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            transition={{ duration: 0.45, ease }}
            className="flex items-start gap-3"
          >
            <Sparkles className="mt-0.5 size-4 shrink-0 text-sun" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-ink">
                Rule of thumb: a{" "}
                <span className="text-sunset font-display text-[1.1em] italic">
                  {DRIVER_NAME[fit.category].toLowerCase()}
                </span>{" "}
                {fit.category === "hybrid" ? "design" : "driver"}{" "}
                <span className="text-ink-muted">— {DRIVER_BLURB[fit.category]}.</span>
              </p>
              <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-ink-faint">
                Because {fit.because.join("; ")}
                {fit.alternative ? `. ${DRIVER_NAME[fit.alternative]} is a close second` : ""}. Reviewer
                consensus, not a measurement — your results show the best of each type either way.
              </p>
            </div>
            <button
              type="button"
              onClick={onUse}
              disabled={using}
              className="shrink-0 rounded-full px-3 py-1 text-[11.5px] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] transition-colors hover:text-ink disabled:opacity-50"
            >
              {using ? "Chosen" : "Use this"}
            </button>
          </motion.div>
        ) : (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 text-[12.5px] leading-snug text-ink-faint"
          >
            <Sparkles className="size-4 shrink-0 text-ink-faint" />
            Choose what you play, and AURALS will say which kind of driver tends to suit it.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A small, quiet toggle. Used for both refinements so they read as one row. */
function Chip({
  on,
  onClick,
  title,
  hint = false,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  /** The rule of thumb points here: a small mark, never a preselection. */
  hint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={cn(
        "relative rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap transition-[background-color,box-shadow,color] duration-500",
        on
          ? "bg-ember/12 text-ink shadow-[inset_0_0_0_1px_rgb(255_107_61/0.6)]"
          : "text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] hover:bg-white/[0.05] hover:text-ink",
      )}
    >
      {children}
      {hint && (
        <span
          aria-label="suggested"
          className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-sun shadow-[0_0_8px_rgb(241_211_155/0.9)]"
        />
      )}
    </button>
  );
}
