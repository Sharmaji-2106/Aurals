"use client";

import { FlowLoading } from "@/components/flow/flow-shell";
import { ResearchStage } from "@/components/research/research-stage";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { Lines } from "@/components/site/reveal";
import { ButtonLink } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { isApiError } from "@/lib/api/client";
import { useReviews } from "@/lib/api/hooks";
import { plural } from "@/lib/format";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { use } from "react";

export default function ResearchPage({ params }: PageProps<"/research/[slug]">) {
  const { slug } = use(params);
  const reviews = useReviews(slug);
  const data = reviews.data;

  return (
    <>
      <SiteHeader />
      <main className="shell flex-1 pt-12 pb-28 sm:pt-20">
        {reviews.error ? (
          <div className="mx-auto max-w-xl py-16">
            <ErrorNote>
              {isApiError(reviews.error, 404)
                ? "We haven't gathered review evidence for that earphone yet."
                : reviews.error.message}
            </ErrorNote>
            <ButtonLink href="/match" variant="secondary" className="mt-6">
              Back to your matches
            </ButtonLink>
          </div>
        ) : !data ? (
          <FlowLoading label="Opening the evidence" />
        ) : (
          <>
            <div className="grid items-end gap-x-16 gap-y-7 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1 }}
                  className="eyebrow eyebrow-rule"
                >
                  What people say
                </motion.p>
                <h1 className="marquee mt-6 text-[clamp(2.6rem,6.4vw,6.25rem)]">
                  <Lines stagger={0.11}>
                    <>
                      <span className="text-ink-muted">{data.iem.brand}</span>{" "}
                      <em className="voice text-sunset">{data.iem.model}</em>,
                    </>
                    <>through other</>
                    <>people&rsquo;s ears.</>
                  </Lines>
                </h1>
              </div>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.35 }}
                className="max-w-md text-[15px] leading-relaxed text-ink-muted lg:pb-3"
              >
                {plural(data.sources.length, "published review")}, and the passages in them that say something
                about how it sounds. Opinions are not measurements: where reviewers disagree, both readings
                stay on the page.
              </motion.p>
            </div>

            <div className="mt-12 sm:mt-16">
              <ResearchStage data={data} />
            </div>

            <p className="mt-8 max-w-3xl text-[12px] leading-relaxed text-ink-faint">
              {data.collection.note}
              {data.collection.retrieved_at && (
                <>
                  {" "}
                  Retrieved{" "}
                  <span className="numeric">
                    {new Date(data.collection.retrieved_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  .
                </>
              )}
            </p>

            <section className="surface relative mt-24 flex flex-col gap-8 overflow-hidden rounded-[2rem] p-8 sm:mt-32 sm:p-14 lg:flex-row lg:items-end lg:justify-between">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-[10%] -bottom-1/2 size-[70%] rounded-full blur-3xl"
                style={{ background: "radial-gradient(closest-side, rgb(255 122 58 / 0.15), transparent)" }}
              />
              <div className="relative max-w-2xl">
                <h2 className="marquee text-[clamp(2.2rem,4.6vw,4.25rem)]">
                  Opinions are <em className="voice text-sunset">one</em> kind of evidence.
                </h2>
                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted">
                  {data.iem.has_measurement
                    ? "AURALS ranks earphones on a measured frequency response against your own target, not on what reviewers felt. Your matches show that measurement beside these impressions."
                    : "We have no measurement for this earphone, so it cannot be ranked against your target — only read about."}
                </p>
              </div>
              <ButtonLink href="/match" size="lg" className="relative shrink-0 self-start lg:self-auto">
                See your matches <ArrowRight className="size-4" />
              </ButtonLink>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
