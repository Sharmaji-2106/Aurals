"use client";

import { FlowLoading, FlowShell } from "@/components/flow/flow-shell";
import { StartScene } from "@/components/landing/start-scene";
import { Lines } from "@/components/site/reveal";
import { useSpectralTransition } from "@/components/transition/spectral-transition";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { journeyHref, useMe, useStartSession } from "@/lib/api/hooks";
import { ArrowRight, Lock } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

const AHEAD = [
  { label: "Music", body: "Paste the songs and playlists you actually play." },
  { label: "Signal", body: "AURALS measures the audio itself, song by song." },
  { label: "Preferences", body: "A few quick questions refine what your music showed." },
  { label: "Your sound", body: "One line, and the earphones that draw the same one." },
];

export default function StartPage() {
  const { data: me, isPending } = useMe();
  const start = useStartSession();
  const { active: transitionActive, begin } = useSpectralTransition();
  const [name, setName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Keep the existing ready-to-type behaviour on desktop. Mobile browsers often
  // open the keyboard as soon as a route mounts, so leave the field available but
  // unfocused there until the user chooses to interact with it.
  useEffect(() => {
    if (!transitionActive && window.matchMedia("(pointer: fine)").matches) nameInputRef.current?.focus();
  }, [transitionActive]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    // The name is written large and the line beneath it starts listening, then the
    // music page comes up behind it (see `NameRite`).
    start.mutate(trimmed, { onSuccess: () => begin("/music", { via: "name", name: trimmed }) });
  };

  return (
    <FlowShell step="start" bleed>
      <StartScene />
      {isPending ? (
        <FlowLoading />
      ) : me && !start.isSuccess ? (
        <Threshold hidden={transitionActive}>
          <p className="eyebrow eyebrow-rule">Welcome back</p>
          <h1 className="marquee mt-7 text-[clamp(3rem,7.6vw,7rem)]">
            <Lines>
              <>Good to hear you,</>
              <>
                <em className="voice text-sunset">{me.profile.display_name}</em>.
              </>
            </Lines>
          </h1>
          <p className="lede mt-7 max-w-lg">
            Your profile is saved in this browser. Pick up where you left off.
          </p>
          <ButtonLink href={journeyHref(me.journey)} size="lg" className="mt-10 self-start">
            Continue <ArrowRight className="size-4" />
          </ButtonLink>
        </Threshold>
      ) : (
        <Threshold hidden={transitionActive} aside>
          <form onSubmit={submit} className="flex flex-col">
            <p className="eyebrow eyebrow-rule">Before we listen</p>
            <h1 className="marquee mt-7 text-[clamp(3rem,7.6vw,7rem)]">
              <Lines>
                <>First, what should</>
                <>
                  we <em className="voice text-sunset">call</em> you?
                </>
              </Lines>
            </h1>
            <label htmlFor="name" className="sr-only">
              Your name
            </label>
            <div className="group relative mt-12 max-w-2xl sm:mt-16">
              <input
                id="name"
                ref={nameInputRef}
                autoComplete="given-name"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="display w-full bg-transparent pb-5 text-[clamp(2.2rem,5vw,3.75rem)] text-ink caret-ember outline-none placeholder:text-white/[0.14]"
              />
              <div className="absolute inset-x-0 bottom-0 h-px bg-hairline-strong" />
              <div className="rule-spectral absolute bottom-0 left-0 w-full origin-left scale-x-0 transition-transform duration-1000 ease-(--ease-out-expo) group-focus-within:scale-x-100" />
            </div>
            {start.error && <ErrorNote className="mt-6 max-w-2xl">{start.error.message}</ErrorNote>}
            <div className="mt-10 flex max-w-2xl flex-col-reverse gap-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex max-w-sm items-start gap-2.5 text-[13px] leading-relaxed text-ink-faint">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                No email or password. Your profile lives in this browser, and you can delete everything
                whenever you like.
              </p>
              <Button type="submit" size="lg" disabled={!name.trim()} loading={start.isPending}>
                Continue <ArrowRight className="size-4" />
              </Button>
            </div>
          </form>
        </Threshold>
      )}
    </FlowShell>
  );
}

/**
 * The doorway into the product.
 *
 * The departure from the landing page ends with its sound field dissolving, so
 * this page keeps the same field, at rest and low on the horizon: you arrive in
 * the room you were just looking at, rather than in a form.
 */
function Threshold({
  children,
  hidden,
  aside = false,
}: {
  children: ReactNode;
  hidden: boolean;
  aside?: boolean;
}) {
  return (
    <div className="relative isolate flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[52%]"
        style={{
          maskImage: "linear-gradient(to top, black 18%, transparent 96%)",
          WebkitMaskImage: "linear-gradient(to top, black 18%, transparent 96%)",
        }}
      >
        <div
          className="absolute right-[-10%] bottom-[-40%] h-full w-[70%] rounded-[50%] blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgb(255 122 58 / 0.16), transparent)" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: hidden ? 0 : 1, y: hidden ? 16 : 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="shell grid flex-1 grid-cols-1 items-start gap-x-16 gap-y-14 pt-16 pb-[26vh] lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-center lg:pt-10 lg:pb-[22vh]"
      >
        <div className="flex min-w-0 flex-col">{children}</div>
        {aside && (
          <motion.ol
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.6 }}
            className="hidden max-w-xs flex-col rounded-[1.5rem] bg-[rgb(14_10_20/0.55)] px-6 pt-6 pb-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),inset_0_0_0_1px_rgb(255_255_255/0.06)] backdrop-blur-xl lg:flex lg:justify-self-end"
            aria-label="What happens next"
          >
            <li className="eyebrow pb-5">What happens next</li>
            {AHEAD.map((step, i) => (
              <li key={step.label} className="grid grid-cols-[2.25rem_1fr] border-t border-hairline py-4">
                <span className="folio pt-0.5">0{i + 1}</span>
                <span>
                  <span className="block text-[14px] text-ink">{step.label}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink-faint">{step.body}</span>
                </span>
              </li>
            ))}
          </motion.ol>
        )}
      </motion.div>
    </div>
  );
}
