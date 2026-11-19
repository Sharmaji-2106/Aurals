import type { Schemas } from "@/lib/api/client";

export type UseCaseKey = Schemas["ProfileOut"]["use_cases"][number];
export type DriverPreference = NonNullable<Schemas["ProfileOut"]["driver_preference"]>;

/**
 * What a listener plays, and where they listen.
 *
 * `wants` is the listener's own reason for choosing the card, not a claim about which
 * products suit it. Nothing here is used to rank or filter a recommendation: ranking
 * comes from measured frequency response against the listener's personal target, and
 * the screens that show these say so. The one thing they do feed is the driver-type
 * rule of thumb in `driver-fit.ts`, which is labelled as exactly that wherever shown.
 *
 * `motif` picks one of a few small visuals, reused across cards rather than giving
 * every card an animation of its own.
 */
export type Motif = "rings" | "pulse" | "precision" | "position" | "steady" | "bars" | "spike" | "strings";
export type UseCaseGroup = "music" | "life";

export const USE_CASES: {
  key: UseCaseKey;
  title: string;
  wants: string;
  motif: Motif;
  group: UseCaseGroup;
}[] = [
  {
    key: "pop",
    title: "Pop",
    wants: "Clear vocals over a polished, punchy mix",
    motif: "bars",
    group: "music",
  },
  {
    key: "hip_hop",
    title: "Hip-hop & rap",
    wants: "Low-end extension, impact and vocals that cut through",
    motif: "pulse",
    group: "music",
  },
  {
    key: "rock_metal",
    title: "Rock & metal",
    wants: "Guitars with bite, drums that hit, nothing smeared",
    motif: "spike",
    group: "music",
  },
  {
    key: "electronic",
    title: "Electronic & EDM",
    wants: "Extended bass under dense, layered mixes",
    motif: "rings",
    group: "music",
  },
  {
    key: "bollywood",
    title: "Bollywood & Indian",
    wants: "Voices up front, rich percussion, warm strings",
    motif: "bars",
    group: "music",
  },
  {
    key: "classical",
    title: "Classical & film scores",
    wants: "Real instrument tone and a wide, layered stage",
    motif: "strings",
    group: "music",
  },
  {
    key: "jazz_acoustic",
    title: "Jazz & acoustic",
    wants: "Natural timbre, texture and air around each player",
    motif: "strings",
    group: "music",
  },
  {
    key: "cinematic_gaming",
    title: "Cinematic gaming",
    wants: "Immersion, impact and a convincing sense of space",
    motif: "rings",
    group: "life",
  },
  {
    key: "competitive_gaming",
    title: "Competitive gaming",
    wants: "Positional cues, separation and clear detail",
    motif: "position",
    group: "life",
  },
  {
    key: "production",
    title: "Music production",
    wants: "Tonal balance you can trust while you work",
    motif: "precision",
    group: "life",
  },
  {
    key: "stage_monitoring",
    title: "Singing & stage",
    wants: "Vocal clarity, isolation and a secure fit",
    motif: "precision",
    group: "life",
  },
  {
    key: "everyday",
    title: "Everyday listening",
    wants: "Comfort, versatility and long sessions",
    motif: "steady",
    group: "life",
  },
  {
    key: "podcasts",
    title: "Podcasts & voices",
    wants: "Speech clarity and natural-sounding voices",
    motif: "steady",
    group: "life",
  },
];

export const USE_CASE_TITLE: Record<string, string> = Object.fromEntries(
  USE_CASES.map((u) => [u.key, u.title]),
);

export const DRIVER_PREFERENCES: { key: DriverPreference; label: string; note: string }[] = [
  {
    key: "none",
    label: "No preference",
    note: "Recommend whatever measures best for me",
  },
  { key: "dynamic", label: "Dynamic", note: "A single moving diaphragm" },
  { key: "balanced_armature", label: "Balanced armature", note: "Small drivers, often several per side" },
  { key: "planar", label: "Planar magnetic", note: "A flat, evenly driven diaphragm" },
  { key: "hybrid", label: "Hybrid", note: "More than one driver type together" },
];

export const DRIVER_LABEL: Record<string, string> = Object.fromEntries(
  DRIVER_PREFERENCES.map((d) => [d.key, d.label]),
);
