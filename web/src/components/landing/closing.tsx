"use client";

import { useDepart } from "@/components/landing/depart";
import { SignatureStage, StageArea, StageLine } from "@/components/signature/stage";
import { DrawnRule, Lines, Reveal } from "@/components/site/reveal";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { ILLUSTRATION_FREQS as F, PREFERENCE } from "./illustration";

const PRINCIPLES = [
  {
    title: "Measured first.",
    body: "Loudness follows ITU-R BS.1770; spectra are long-term averages of the actual audio. Every number can be traced back to a signal.",
  },
  {
    title: "Guesses say so.",
    body: "Anything inferred says, in words, what it rests on. Unknown stays unknown, and nothing is filled in to look complete.",
  },
  {
    title: "Yours to delete.",
    body: "No email, no password. Audio is discarded right after analysis, and one click erases everything you gave us.",
  },
];

/**
 * The principles as a statement and three columns beneath it, the way a
 * manifesto is set: the claim at full width, then what it commits to.
 */
export function Principles() {
  return (
    <section className="relative">
      <div className="shell pt-28 pb-10 sm:pt-44 sm:pb-16">
        <p className="eyebrow eyebrow-rule text-ink-muted">Principles · After dark</p>
        <h2 className="marquee mt-6 text-[clamp(4rem,13vw,13rem)] leading-[0.84]">
          <Lines onView stagger={0.12}>
            <>Measured,</>
            <span className="block sm:pl-[1.2em]">
              not <em className="voice text-neon">guessed</em>.
            </span>
          </Lines>
        </h2>

        <ol className="mt-16 grid grid-cols-1 gap-x-12 gap-y-12 sm:mt-24 md:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} className="relative">
              <DrawnRule delay={i * 0.14} />
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-12% 0px" }}
                transition={{ duration: 1, delay: 0.15 + i * 0.14, ease: [0.16, 1, 0.3, 1] }}
                className="pt-6"
              >
                <span className="marquee text-[2.4rem] text-transparent [-webkit-text-stroke:1px_rgb(70_224_255/0.6)]">
                  0{i + 1}
                </span>
                <h3 className="display mt-5 text-[clamp(2rem,2.9vw,2.75rem)] leading-[1]">{p.title}</h3>
                <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-muted">{p.body}</p>
              </motion.div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * The last thing on the page is the thing the product makes: one line, drawn
 * edge to edge, with the invitation set on top of it.
 */
export function Closing() {
  const ref = useRef<HTMLDivElement>(null);
  const { depart } = useDepart();
  const inView = useInView(ref, { once: true, margin: "-25% 0px" });
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[18%] -z-10 mx-auto h-[70%] w-[90%] rounded-[50%] blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgb(255 92 138 / 0.14), rgb(61 139 255 / 0.06) 60%, transparent)",
        }}
      />
      <div ref={ref} className="pt-20 pb-24 sm:pt-28 sm:pb-36">
        {/* Full bleed: the line belongs to the page, not to a column of it. */}
        <div className="h-48 sm:h-72">
          {inView && (
            <SignatureStage height="100%" domain={[-0.95, 0.95]} label="A single sound signature">
              <StageArea series={{ freqs: F, values: PREFERENCE }} opacity={0.55} />
              <StageLine series={{ freqs: F, values: PREFERENCE }} draw width={3} />
            </SignatureStage>
          )}
        </div>
        <div className="shell -mt-6 flex flex-col items-start gap-10 sm:-mt-10 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="marquee text-[clamp(3.6rem,10vw,10rem)] leading-[0.86]">
            <Lines onView stagger={0.12}>
              <>Start with</>
              <>
                one <em className="voice text-sunset">playlist</em>.
              </>
            </Lines>
          </h2>
          <Reveal delay={0.25} className="flex flex-col gap-4 lg:pb-4">
            <ButtonLink href="/start" size="lg" onClick={depart}>
              Find my sound <ArrowRight className="size-4" />
            </ButtonLink>
            <p className="text-[13px] text-ink-faint">About two minutes of your time. No sign-up.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
