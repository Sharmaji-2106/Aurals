"use client";

import { useSpectralTransition } from "@/components/transition/spectral-transition";
import { useRouter } from "next/navigation";
import { useEffect, type MouseEvent } from "react";

const START_FRAME = "/film/ascent/frames/0096.webp";

/**
 * Leaving the homepage for the journey: the horizon split (`AscentField`).
 *
 * The destination route and the name page's background frame are warmed once
 * the page has settled; the transition itself needs only the frame already on
 * screen, so it plays the instant the button is pressed. Modified clicks (new
 * tab, and so on) are left to the browser.
 */
export function useDepart(to = "/start") {
  const router = useRouter();
  const { active, begin } = useSpectralTransition();

  useEffect(() => {
    router.prefetch(to);
    // Warm the name page's background (the ascent's last frame) so the opening reveals it at once.
    const id = window.setTimeout(() => {
      const img = new Image();
      img.src = START_FRAME;
    }, 1200);
    return () => window.clearTimeout(id);
  }, [router, to]);

  const depart = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const from = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    // Always the horizon split: it needs only the frame already on screen, so
    // it never has to wait for anything (and never falls back to the old field).
    begin(to, { via: "ascent", from });
  };

  return { leaving: active, depart };
}
