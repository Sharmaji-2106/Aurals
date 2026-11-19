import { SiteHeader } from "@/components/site/header";
import { Lines } from "@/components/site/reveal";
import { ButtonLink } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

/** A flat line: the one place in Auralis where there is no signal to draw. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="relative isolate flex flex-1 flex-col justify-center overflow-hidden py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 flex -translate-y-1/2 flex-col"
        >
          <div
            className="rule-spectral origin-left opacity-50"
            style={{ animation: "draw-x 2.4s var(--ease-out-expo) both" }}
          />
        </div>
        <div className="shell">
          <p
            className="pointer-events-none font-display text-[clamp(7rem,22vw,19rem)] leading-[0.74] tracking-[-0.05em] text-transparent select-none"
            style={{ WebkitTextStroke: "1px rgb(238 235 229 / 0.2)" }}
            aria-hidden="true"
          >
            404
          </p>
          <div className="-mt-[clamp(1rem,4vw,3.5rem)]">
            <p className="eyebrow eyebrow-rule">No signal</p>
            <h1 className="display mt-6 text-[clamp(3rem,7vw,6.5rem)] leading-[0.9]">
              <Lines>
                <span>Nothing to</span>
                <span>
                  <em className="text-ember-soft">hear</em> here.
                </span>
              </Lines>
            </h1>
            <p className="lede mt-7">That page doesn&rsquo;t exist, or it moved.</p>
            <ButtonLink href="/" variant="secondary" className="mt-9">
              <ArrowLeft className="size-4" /> Back to AURALS
            </ButtonLink>
          </div>
        </div>
      </main>
    </>
  );
}
