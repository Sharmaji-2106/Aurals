import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { Lines } from "@/components/site/reveal";
import { BANDS } from "@/lib/bands";
import { formatHz } from "@/lib/format";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Method & privacy",
  description: "What AURALS measures, what it infers, and what it keeps.",
};

/**
 * One chapter. The number and its name hold their place in the margin while the
 * chapter is read, the way a running head does in a printed report.
 */
function Block({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [number, name] = label.split(" · ");
  return (
    <section className="grid grid-cols-1 gap-x-16 gap-y-6 border-t border-hairline py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="flex items-end gap-5 lg:sticky lg:top-28 lg:flex-col lg:items-start lg:gap-4 lg:self-start">
        <span
          className="font-display text-[clamp(3.5rem,6vw,5.5rem)] leading-[0.8] text-transparent"
          style={{ WebkitTextStroke: "1px rgb(238 235 229 / 0.32)" }}
          aria-hidden="true"
        >
          {number}
        </span>
        <p className="eyebrow text-ink-muted">
          <span className="sr-only">{number} · </span>
          {name}
        </p>
      </div>
      <div className="max-w-2xl">
        <h2 className="marquee text-[clamp(2.1rem,3.6vw,3.25rem)]">{title}</h2>
        <div className="mt-7 space-y-5 text-[16px] leading-[1.7] text-ink-muted [&_strong]:font-normal [&_strong]:text-ink">
          {children}
        </div>
      </div>
    </section>
  );
}

export default function MethodPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell flex-1 pt-16 pb-28 sm:pt-28">
        <div className="grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow eyebrow-rule">Method &amp; privacy</p>
            <h1 className="marquee mt-7 text-[clamp(3rem,8vw,8rem)]">
              <Lines stagger={0.11}>
                <span>What we measure,</span>
                <span>
                  what we <em className="voice text-sunset">infer</em>,
                </span>
                <span>what we keep.</span>
              </Lines>
            </h1>
          </div>
          <p className="lede max-w-md lg:pb-4">
            AURALS tries to be useful without pretending. This page explains which numbers are measurements,
            which are informed guesses, and how your data is handled.
          </p>
        </div>

        <div className="mt-16 sm:mt-28">
          <Block label="01 · Measured" title="Signals from the audio itself">
            <p>
              Each song is downloaded temporarily, decoded and analysed as a whole (up to ten minutes). We
              compute its <strong>long-term average spectrum</strong>, the power in nine frequency bands
              relative to 500&nbsp;Hz–2&nbsp;kHz, <strong>integrated loudness</strong> and{" "}
              <strong>loudness range</strong> following ITU-R BS.1770 and EBU Tech 3342, peak level, stereo
              side energy, spectral centroid and flatness, tempo, onset rate, the share of percussive energy,
              and a timbre fingerprint (MFCC statistics).
            </p>
            <p>
              Streaming codecs remove content at the very top of the spectrum. We detect each track&rsquo;s
              effective bandwidth and lower our confidence in the air band when content is missing.
            </p>
          </Block>

          <Block label="02 · Inferred" title="Descriptors, labelled as heuristics">
            <p>
              Words like <strong>warmth</strong>, <strong>brightness</strong> or <strong>energy</strong> are
              summaries of the measurements, scored against a small reference corpus of commercially released
              music across many genres. A value of 0.5 means &ldquo;typical for that corpus&rdquo;. They are
              transparent heuristics, not validated perceptual models, and they are versioned so they can be
              replaced by learned models without losing history.
            </p>
            <p>
              Your library is curated before it&rsquo;s summarised: duplicate uploads count once, acoustically
              atypical items are down-weighted (never silently dropped), and distinct sonic groups are kept
              visible.
            </p>
          </Block>

          <Block label="03 · Your sound" title="Your music leads, your answers refine">
            <p>
              Your sound is estimated relative to the <strong>Harman in-ear target</strong>, the response most
              listeners preferred in controlled blind tests (Olive, Welti and Khonsaripour). The same research
              found people differ mostly in how much bass, and to a lesser degree treble, they want, so that
              is where your estimate starts: from how widely listeners vary.
            </p>
            <p>
              Your music is the <strong>primary evidence</strong>. Its balance, measured against a reference
              set of recordings and with its uncertainty from resampling your songs, shifts that starting
              point. Whether the music people play predicts the tuning they prefer has not been studied yet,
              so AURALS states it as one explicit assumption rather than a fact. Your answers are treated as
              honest but imperfect measurements, with the reliability typical of single questions, and refine
              the estimate. Things music can&rsquo;t show, like how bright highs feel to you, rest on your
              answers alone.
            </p>
            <p>
              The result is a small statistical model (sound-profile/3) with every assumption named and
              sourced. There is no fixed split between music and answers and no confidence percentage: each
              value comes with a range, and says in words what it rests on.
            </p>
          </Block>

          <Block label="04 · Matching" title="Measured, then predicted, then explained">
            <p>
              Earphones are compared through real frequency-response measurements: oratory1990&rsquo;s in-ear
              measurements (via the AutoEq project), all on IEC 60318-4 ear simulators, the fixture the Harman
              in-ear target was defined on. Each is stored with its source, rig and configuration, aligned at
              500 Hz and compared with your target: the Harman target plus your offsets. Measurements from
              other rigs are never mixed in.
            </p>
            <p>
              The ranking uses the Harman in-ear preference model, which predicted listeners&rsquo; ratings
              with a correlation of 0.91 from how far a response deviates from the target, how uneven it is
              and how tilted. AURALS reproduces the published scores exactly and applies the model to your
              target, averaged over your uncertainty; that personalisation is AURALS&rsquo; extension. Every
              reason is computed region by region, using the same nine bands:
            </p>
            <ul className="well grid grid-cols-1 gap-x-8 rounded-[1.25rem] px-6 py-4 sm:grid-cols-3">
              {BANDS.map((b) => (
                <li
                  key={b.key}
                  className="flex items-baseline justify-between gap-3 border-b border-hairline py-2.5 text-[13px] last:border-b-0 sm:[&:nth-last-child(-n+3)]:border-b-0"
                >
                  <span className="flex items-center gap-2.5 text-ink">
                    <span className="size-1.5 rounded-full" style={{ background: b.color }} />
                    {b.label}
                  </span>
                  <span className="numeric text-[11px] text-ink-faint">
                    {formatHz(b.low)}–{formatHz(b.high)}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Above 10 kHz, measurement fixtures stop being reliable, so that region is shown but not scored.
              Unknown prices stay unknown. Language models may help summarise reviews one day, but they will
              never supply the facts a recommendation rests on.
            </p>
          </Block>

          <Block label="05 · Privacy" title="Minimal by design">
            <p>
              We ask for a display name only. Your session is an anonymous, HTTP-only cookie; we store a hash
              of it, not the token. Audio files are deleted as soon as they have been analysed. What remains
              are numeric features of public tracks, which contain nothing about you.
            </p>
            <p>
              Links you paste are reduced to a YouTube video or playlist ID before anything is fetched. You
              can delete your profile, submissions, answers and sound profile at any time from your results
              page.
            </p>
          </Block>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
