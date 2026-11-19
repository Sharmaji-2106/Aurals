"use client";

import { Logo } from "@/components/brand/logo";
import { Lines } from "@/components/site/reveal";
import { Button, ButtonLink } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <header className="shell flex h-16 items-center">
        <Logo />
      </header>
      <main className="relative isolate flex flex-1 flex-col justify-center overflow-hidden py-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-1/4 right-[-10%] -z-10 size-[60%] rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgb(255 107 107 / 0.1), transparent)" }}
        />
        <div className="shell">
          <p className="eyebrow eyebrow-rule">Something broke</p>
          <h1 className="display mt-7 text-[clamp(3rem,8vw,7.5rem)] leading-[0.9]">
            <Lines>
              <>That didn&rsquo;t</>
              <>
                <em className="text-ember-soft">sound</em> right.
              </>
            </Lines>
          </h1>
          <p className="lede mt-7 max-w-lg">An unexpected error interrupted this page. Your data is safe.</p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button onClick={reset}>
              <RotateCcw className="size-4" /> Try again
            </Button>
            <ButtonLink href="/" variant="ghost">
              Back to AURALS
            </ButtonLink>
          </div>
        </div>
      </main>
    </>
  );
}
