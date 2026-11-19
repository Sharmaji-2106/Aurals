"use client";

import { Afterglow } from "@/components/scene/afterglow";
import type { HourName } from "@/components/scene/hours";
import { usePathname } from "next/navigation";

/**
 * The light behind every page but the homepage.
 *
 * The homepage is the place itself — the beach at sunset. Everywhere else
 * keeps only its light, abstract, at the hour of that step of the journey:
 * you start at golden hour and meet your sound after dark.
 */
function hourFor(path: string): HourName | null {
  if (path === "/" || path.endsWith("-studio") || path.startsWith("/edition")) return null;
  if (path.startsWith("/start")) return "golden";
  if (path.startsWith("/music")) return "sunset";
  if (path.startsWith("/analysis")) return "dusk";
  if (path.startsWith("/tune") || path.startsWith("/world")) return "blue";
  if (path.startsWith("/match") || path.startsWith("/profile")) return "night";
  return "dusk";
}

export function SiteGlow() {
  const hour = hourFor(usePathname() ?? "/");
  if (!hour) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <Afterglow key={hour} hour={hour} className="absolute inset-0" />
    </div>
  );
}
