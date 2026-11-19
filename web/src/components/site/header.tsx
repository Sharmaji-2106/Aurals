"use client";

import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { journeyHref, useMe } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

const NAV = [
  { href: "/store", label: "Store" },
  { href: "/#journey", label: "How it works" },
  { href: "/#bands", label: "The nine bands" },
  { href: "/method", label: "Method" },
];

/**
 * Site header. With `overlay`, it starts transparent over a full-bleed hero and gains
 * its backdrop once the page scrolls.
 */
export function SiteHeader({
  children,
  className,
  overlay = false,
}: {
  children?: ReactNode;
  className?: string;
  overlay?: boolean;
}) {
  const { data: me, isPending } = useMe();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));
  const solid = !overlay || scrolled;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-700 ease-(--ease-out-expo)",
        // The edge is a shadow, not a border: the bar reads as a sheet lifted off
        // the page, and there is no line to switch on as the hero scrolls away.
        solid
          ? "bg-canvas/55 shadow-[inset_0_-1px_0_rgb(255_236_222/0.07),0_18px_40px_-28px_rgb(4_2_10/0.9)] backdrop-blur-2xl backdrop-saturate-150"
          : "bg-transparent",
        className,
      )}
    >
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Logo />
        {children ?? (
          <nav className="flex items-center gap-1 sm:gap-7">
            <ul className="hidden items-center gap-7 md:flex">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="link-draw pb-1 font-marquee text-[13px] font-semibold tracking-[0.16em] text-ink/75 uppercase transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            {isPending ? (
              <span className="skeleton h-8 w-28 rounded-full" />
            ) : me ? (
              <ButtonLink href={journeyHref(me.journey)} size="sm" variant="secondary" className="pl-1.5">
                <span className="grid size-5 place-items-center rounded-full bg-linear-to-br from-sun to-flamingo font-display text-[12px] leading-none text-[#1d0b16]">
                  {me.profile.display_name.slice(0, 1).toUpperCase()}
                </span>
                {me.journey.next_step === "sound_profile" ? "Your sound" : "Continue"}
              </ButtonLink>
            ) : (
              <ButtonLink href="/start" size="sm">
                Get started
              </ButtonLink>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
