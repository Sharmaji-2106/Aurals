"use client";

import { BANDS, mixHex } from "@/lib/bands";
import { thumbnailUrl } from "@/lib/youtube";

/**
 * Shared material for the studio: the artwork every concept draws from and the
 * two colour ramps it works in. The silhouette, the nodal figures and the noise
 * live in `lib/grain/geometry`, because the product uses them too.
 *
 * The artwork is real: these are recordings Auralis has already measured, loaded
 * through the same thumbnail helper the product uses, so the concepts are judged
 * against the covers they will actually carry.
 */

export type Art = { id: string; title: string; artist: string };

export const ARTWORK: Art[] = [
  { id: "4NRXx6U8ABQ", title: "Blinding Lights", artist: "The Weeknd" },
  { id: "Y3ywicffOj4", title: "Dreams", artist: "Fleetwood Mac" },
  { id: "K0HSD_i2DvA", title: "Around the World", artist: "Daft Punk" },
  { id: "oHRNrgDIJfo", title: "Feeling Good", artist: "Nina Simone" },
  { id: "4qQyUi4zfDs", title: "Glory Box", artist: "Portishead" },
  { id: "2tOutF8B3f8", title: "Xtal", artist: "Aphex Twin" },
  { id: "0CFuCYNx-1g", title: "Superstition", artist: "Stevie Wonder" },
  { id: "ks_qOI0lzho", title: "Lovesong", artist: "The Cure" },
  { id: "JwJU042KU0s", title: "Cherry Blossom", artist: "Empire of the Sun" },
  { id: "C5B22ONbFrc", title: "Fire", artist: "MEDUZA" },
  { id: "uksTezIJqA4", title: "Lovers in a Past Life", artist: "Calvin Harris" },
  { id: "ZDZiXmCl4pk", title: "Whatever", artist: "Kygo" },
  { id: "y6qigQlIFB4", title: "Changes", artist: "Empire of the Sun" },
  { id: "-p5FeDRqLf0", title: "Never Be Alone", artist: "Becky Hill" },
  { id: "hLX5WwccHs8", title: "Here By Now", artist: "Drove" },
  { id: "lBdQy97uTiw", title: "For Life", artist: "Kygo" },
];

export const cover = (art: Art) => thumbnailUrl(art.id);

/* --------------------------------------------------------------- colour --- */

/** The spectral ramp as a continuous scale: 0 is sub-bass, 1 is air. */
export function spectral(t: number) {
  const pos = Math.min(0.9999, Math.max(0, t)) * (BANDS.length - 1);
  const i = Math.floor(pos);
  return mixHex(BANDS[i].color, BANDS[i + 1].color, pos - i);
}

/** The same ramp as 0-1 floats, for shaders and canvas maths. */
export function spectralRgb(t: number): [number, number, number] {
  const hex = spectral(t);
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const SPECTRAL_STOPS = BANDS.map((b, i) => ({
  offset: i / (BANDS.length - 1),
  color: b.color,
}));

/**
 * A second palette, for 05 only: a night-into-sunset ramp — deep violet through
 * magenta into gold, with a cold teal reserved for accents. The mapping is the
 * same idea as the spectral one (position along the object sets the colour); only
 * the hues change.
 */
export const VICE_STOPS = [
  { offset: 0, color: "#3a1663" },
  { offset: 0.16, color: "#7b2ff7" },
  { offset: 0.34, color: "#c026d3" },
  { offset: 0.52, color: "#ff2d95" },
  { offset: 0.7, color: "#ff6a3d" },
  { offset: 0.86, color: "#ffb347" },
  { offset: 1, color: "#ffe6a8" },
] as const;

export const VICE_TEAL = "#2de2e6";

export function vice(t: number) {
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < VICE_STOPS.length - 2 && x > VICE_STOPS[i + 1].offset) i += 1;
  const a = VICE_STOPS[i];
  const b = VICE_STOPS[i + 1];
  return mixHex(a.color, b.color, (x - a.offset) / (b.offset - a.offset));
}

export { HEADPHONE, HEADPHONE_OUTLINE, chladniPoints, rand, silhouettePoints } from "@/lib/grain/geometry";
