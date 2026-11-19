"use client";

import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";

/**
 * Where you are on a long page: a quiet index down the right edge, one mark per
 * section, the current one lit. Labels show on hover; a mark scrolls to its
 * section. Desktop only — on a phone the page is read straight down.
 */
const LABELS: Record<string, string> = {
  "sound-card": "Your card",
  "your-sound": "Your sound",
  match: "Your match",
  "budget-picks": "Your budget",
  "driver-picks": "Driver type",
  field: "The field",
  fingerprint: "Your music",
  community: "Owners",
  numbers: "The numbers",
};

export function SectionIndex() {
  const [ids, setIds] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const find = () =>
      [...document.querySelectorAll<HTMLElement>("[data-section]")].filter(
        (el) => LABELS[el.dataset.section ?? ""],
      );
    let sections = find();
    const onScroll = () => {
      const line = window.innerHeight * 0.4;
      let at: string | null = null;
      for (const el of sections) if (el.getBoundingClientRect().top <= line) at = el.dataset.section!;
      setCurrent(at ?? sections[0]?.dataset.section ?? null);
    };
    // Sections arrive as data loads: look again whenever the page changes size
    // (the observer also reports once on start, which sets the first state).
    const observer = new ResizeObserver(() => {
      sections = find();
      setIds(sections.map((el) => el.dataset.section!));
      onScroll();
    });
    observer.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (ids.length < 3) return null;
  return (
    <nav
      aria-label="On this page"
      className="fixed top-1/2 right-5 z-40 hidden -translate-y-1/2 flex-col items-end gap-3 xl:flex"
    >
      {ids.map((id) => {
        const on = id === current;
        return (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document
                .querySelector(`[data-section="${id}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            aria-current={on ? "true" : undefined}
            className="group flex items-center gap-3"
          >
            <span
              className={cn(
                "text-[11px] tracking-wide whitespace-nowrap transition-[opacity,color] duration-300",
                "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                on ? "text-ink-muted" : "text-ink-faint",
              )}
            >
              {LABELS[id]}
            </span>
            <span
              className={cn(
                "h-px transition-[width,background-color] duration-500",
                on ? "w-7 bg-sun" : "w-3.5 bg-white/25 group-hover:w-5 group-hover:bg-white/50",
              )}
            />
          </a>
        );
      })}
    </nav>
  );
}
