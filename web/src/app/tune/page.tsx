"use client";

import { FlowLoading, FlowShell } from "@/components/flow/flow-shell";
import { useRequiredSession } from "@/components/flow/use-session";
import { ChoiceInput, ScaleInput } from "@/components/tune/inputs";
import { ListeningExample, type ExampleClip } from "@/components/tune/listening-example";
import { initialPractical, PracticalStep, type Practical } from "@/components/tune/practical-step";
import { QuestionVisual } from "@/components/tune/question-visual";
import { QUESTION_EXAMPLES } from "@/lib/audio/examples";
import { SoundShaper } from "@/components/tune/sound-shaper";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import type { Me, Questionnaire } from "@/lib/api/client";
import { TuningFlow } from "@/components/tuning/tuning-flow";
import { VolumeRail } from "@/components/listen/volume";
import {
  useLatestAnswers,
  useLatestTuning,
  useQuestionExamples,
  useQuestionnaire,
  useSoundPreview,
  useSubmitAnswers,
  useUpdateProfile,
} from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { budgetStops } from "@/lib/currency";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Tonal questions are illustrated by the live curve itself; these need their own picture.
const ILLUSTRATED = new Set(["energy", "detail", "soundstage", "naturalness"]);

export default function TunePage() {
  const session = useRequiredSession();
  const questionnaire = useQuestionnaire();
  const latest = useLatestAnswers(session.ready);
  const tuning = useLatestTuning(session.ready);
  // Started on arrival, so the songs are cut while the listening session plays.
  const examples = useQuestionExamples(session.ready && Boolean(session.me?.journey.has_music_profile));
  // Ears first: a listener without a listening session starts with one (or skips it).
  const [phase, setPhase] = useState<"auto" | "listening" | "questions">("auto");
  const listening = phase === "listening" || (phase === "auto" && tuning.data === null);

  const loading = !session.ready || questionnaire.isPending || latest.isPending || tuning.isPending;
  return (
    <FlowShell step="tune" wide>
      {questionnaire.error ? (
        <ErrorNote>{questionnaire.error.message}</ErrorNote>
      ) : loading || !session.me || !questionnaire.data ? (
        <FlowLoading />
      ) : listening ? (
        <TuningFlow
          onStart={() => setPhase("listening")}
          onDone={() => setPhase("questions")}
          onSkip={() => setPhase("questions")}
        />
      ) : (
        <>
          {/* The questions play A/B examples too: the same volume, on the same edge. */}
          <VolumeRail />
          <div className="sm:pr-20">
            <Tuner
              me={session.me}
              questionnaire={questionnaire.data}
              previous={latest.data?.version === questionnaire.data.version ? latest.data.answers : null}
              clips={(examples.data?.items ?? []).map((e) => ({
                question: e.question,
                url: e.audio_url,
                title: e.title,
                artist: e.artist,
              }))}
              preparing={examples.data?.status === "preparing"}
              gearHint={deviceName(tuning.data?.device)}
            />
          </div>
        </>
      )}
    </FlowShell>
  );
}

type Answers = Record<string, string | null>;

/** What the listener said they were wearing in the listening session, as words. */
function deviceName(device: Record<string, unknown> | null | undefined): string | null {
  if (!device) return null;
  if (typeof device.label === "string" && device.label) return device.label;
  return null;
}

function Tuner({
  me,
  questionnaire,
  previous,
  clips,
  preparing,
  gearHint,
}: {
  me: Me;
  questionnaire: Questionnaire;
  previous: Answers | null;
  /** Each question's clip from the listener's own playlist, when made. */
  clips: ExampleClip[];
  preparing: boolean;
  gearHint: string | null;
}) {
  const router = useRouter();
  const submitAnswers = useSubmitAnswers();
  const updateProfile = useUpdateProfile();
  const questions = questionnaire.questions;
  const total = questions.length + 1;
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Answers>(() => previous ?? {});
  const [practical, setPractical] = useState<Practical>(() => initialPractical(me.profile, gearHint));
  const question = questions[step];
  const onPractical = step === questions.length;
  const answered = question ? answers[question.id] !== undefined && answers[question.id] !== null : true;
  const answeredCount = questions.filter((q) => answers[q.id] != null).length;

  const draft: Answers = Object.fromEntries(questions.map((q) => [q.id, answers[q.id] ?? null]));
  const preview = useSoundPreview(draft);

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(Math.max(0, Math.min(total - 1, next)));
  };

  const choose = (value: string | null) => {
    if (!question) return;
    setAnswers((a) => ({ ...a, [question.id]: value }));
    if (question.kind === "choice" || value === null) {
      window.setTimeout(() => go(step + 1), value === null ? 0 : 650);
    }
  };

  // Number keys pick scale points; Enter continues.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !question ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const n = Number(event.key);
      if (n >= 1 && n <= question.options.length) {
        setAnswers((a) => ({ ...a, [question.id]: question.options[n - 1].value }));
      } else if (event.key === "Enter" && answers[question.id] != null) {
        go(step + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const finish = async (savePractical: boolean) => {
    try {
      await save(savePractical);
    } catch {
      // Shown through the mutations' error state below.
    }
  };

  const save = async (savePractical: boolean) => {
    await submitAnswers.mutateAsync({ version: questionnaire.version, answers: draft });
    if (savePractical) {
      const stops = budgetStops(practical.currency);
      await updateProfile.mutateAsync({
        currency: practical.currency,
        country_code: practical.country_code,
        experience: practical.experience,
        current_gear: practical.gear,
        ...(practical.budget
          ? {
              budget_min: stops[practical.budget[0]],
              budget_max: practical.budget[1] === stops.length - 1 ? null : stops[practical.budget[1]],
            }
          : {}),
      });
    }
    // Music still measuring? Back to watching it; the listening-world step waits.
    const active = me.journey.active_submission_id;
    router.push(active ? `/analysis/${active}` : "/world");
  };

  const busy = submitAnswers.isPending || updateProfile.isPending;
  const error = submitAnswers.error ?? updateProfile.error ?? preview.error;

  return (
    <div className="-mt-10 grid flex-1 grid-cols-1 gap-x-16 gap-y-8 sm:-mt-14 lg:mt-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-y-12 xl:gap-x-24">
      {/* The question */}
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-6">
          <p className="eyebrow flex items-baseline gap-3">
            {onPractical ? (
              "Last step"
            ) : (
              <>
                <span>Refining</span>
                <span className="numeric text-ink">
                  {String(step + 1).padStart(2, "0")}
                  <span className="text-ink-faint"> / {String(questions.length).padStart(2, "0")}</span>
                </span>
              </>
            )}
          </p>
          <div className="flex max-w-64 flex-1 justify-end gap-[5px]" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                onClick={() => i <= step && go(i)}
                className={cn(
                  "h-[3px] flex-1 rounded-full transition-[background-color,transform] duration-700 ease-(--ease-out-expo)",
                  i < step ? "bg-ink-muted/70" : i === step ? "scale-y-[1.7] bg-ember" : "bg-white/10",
                )}
              />
            ))}
          </div>
        </div>

        <div className="relative mt-10 flex-1">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (d: number) => ({ opacity: 0, y: d * 28, filter: "blur(6px)" }),
                center: { opacity: 1, y: 0, filter: "blur(0px)" },
                exit: (d: number) => ({ opacity: 0, y: d * -20, filter: "blur(6px)" }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              {question ? (
                <div className="flex flex-col">
                  <h1 className="marquee text-[clamp(2.5rem,4.9vw,4.5rem)]">{question.prompt}</h1>
                  {question.help && (
                    <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-muted">
                      {question.help}
                    </p>
                  )}
                  {ILLUSTRATED.has(question.id) && (
                    <div className="mt-8">
                      <QuestionVisual questionId={question.id} value={answers[question.id]} />
                    </div>
                  )}
                  {QUESTION_EXAMPLES[question.id] && (
                    <>
                      <ListeningExample
                        // A new player when the songs arrive, so it starts on this question's own.
                        key={`${question.id}-${clips.length}`}
                        variants={QUESTION_EXAMPLES[question.id]}
                        clips={forQuestion(clips, question.id)}
                        className="mt-7"
                      />
                      {preparing && !clips.length && (
                        <p className="mt-2 text-[11px] text-ink-faint">
                          Cutting examples from your own playlist — they replace this one in a moment.
                        </p>
                      )}
                    </>
                  )}
                  <div className="mt-10">
                    {question.kind === "scale" ? (
                      <ScaleInput question={question} value={answers[question.id]} onChange={choose} />
                    ) : (
                      <ChoiceInput question={question} value={answers[question.id]} onChange={choose} />
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <h1 className="marquee text-[clamp(2.5rem,4.9vw,4.5rem)]">
                    A few <em className="voice text-sunset">practical</em> details.
                  </h1>
                  <p className="mt-5 mb-10 text-[16px] leading-relaxed text-ink-muted">
                    Optional, and you can change them later. Your sound is on the right.
                  </p>
                  <PracticalStep value={practical} onChange={setPractical} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {error && <ErrorNote className="mt-8">{error.message}</ErrorNote>}

        <div className="mt-12 flex items-center justify-between gap-3 border-t border-hairline pt-6">
          <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0 || busy}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {onPractical ? (
              <>
                <Button variant="ghost" onClick={() => finish(false)} disabled={busy}>
                  Skip
                </Button>
                <Button onClick={() => finish(true)} loading={busy}>
                  See my sound <ArrowRight className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => choose(null)}>
                  Not sure
                </Button>
                <Button onClick={() => go(step + 1)} disabled={!answered}>
                  Next <ArrowRight className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* The sound being shaped */}
      <aside className="sticky top-16 z-20 order-first -mx-4 min-w-0 border-b border-hairline bg-canvas/95 px-4 pt-3 pb-3 backdrop-blur sm:-mx-8 sm:px-8 lg:static lg:order-none lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="relative lg:sticky lg:top-28 lg:p-9 lg:[--stage-veil:#050506]">
          <div
            aria-hidden="true"
            className="well pointer-events-none absolute inset-0 hidden rounded-[1.75rem] lg:block"
          />
          <div className="relative">
            <SoundShaper
              preview={preview.data}
              questionId={question?.id ?? null}
              music={
                me.journey.has_music_profile
                  ? "ready"
                  : me.journey.active_submission_id
                    ? "measuring"
                    : "none"
              }
              answered={answeredCount}
              answeredThis={!!question && answers[question.id] != null}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** This question's own clip first, then the listener's other songs to try instead. */
function forQuestion(clips: ExampleClip[], question: string): ExampleClip[] {
  const own = clips.filter((c) => c.question === question);
  const others = clips.filter((c) => c.question !== question && !own.some((o) => o.title === c.title));
  const seen = new Set<string>();
  return [...own, ...others].filter((c) => {
    if (seen.has(c.title)) return false;
    seen.add(c.title);
    return true;
  });
}
