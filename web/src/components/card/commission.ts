import type { Library } from "@/components/card/listener";

/**
 * The Commission: which card a library gets.
 *
 * There are fourteen finishes — card stocks, each with its own material,
 * palette, typeface, line and pattern. Each finish has a character: the kind of
 * music it suits, written as a point in the same measured terms the analyser
 * reports (brightness, warmth, energy, dynamics, width, density, how tightly
 * it is mixed, how loud it is). A library is given the finish nearest its own
 * measurements. That choice is an aesthetic one and says so: the colophon
 * records the numbers it was made from, so a card is never dressed up as more
 * than it is.
 *
 * A listener can also choose another finish; the artwork is the same data in
 * a different stock.
 */

export type Material = "acrylic" | "anodised" | "brass" | "glass" | "pearl" | "chrome" | "ceramic";
export type LineStyle = "single" | "echo" | "ridges" | "dots" | "bars" | "ribbon";
export type Pattern = "none" | "pinstripe" | "grid" | "rings" | "dots" | "waves" | "sunburst";

export const FINISH_IDS = [
  "neon",
  "ember",
  "golden",
  "velvet",
  "tide",
  "salt",
  "aurora",
  "obsidian",
  "chrome",
  "jade",
  "coral",
  "midnight",
  "sakura",
  "ultraviolet",
] as const;
export type FinishId = (typeof FINISH_IDS)[number];
/** Kept for older call sites. */
export type FamilyId = FinishId;

export type ArtDirection = {
  family: FinishId;
  name: string;
  /** In plain words, the music this finish suits. */
  mood: string;
  hour: { name: string; sky: string[]; sun: string };
  palette: {
    /** The card stock's colour. */
    base: string;
    /** What an engraved line looks like. */
    cut: string;
    /** The light lines take on (edge-lit acrylic, foil). */
    glow: string;
    accent: string;
    ink: string;
    paper: string;
  };
  material: Material;
  type: {
    /** The title's font (static instance in /card/fonts, or an absolute path). */
    engrave: string;
    /** Labels and small lettering. */
    small: string;
    tracking: number;
    uppercase: boolean;
  };
  line: LineStyle;
  pattern: Pattern;
  colophon: { decision: string; because: string }[];
};

type Features = {
  brightness: number;
  warmth: number;
  energy: number;
  dynamics: number;
  width: number;
  density: number;
  /** 1 = tightly mixed (small loudness range), 0 = very open. */
  compression: number;
  /** 1 = mastered loud, 0 = very quiet. */
  loudness: number;
};

type Finish = Omit<ArtDirection, "family" | "colophon"> & { suits: Features };

const f = (
  brightness: number,
  warmth: number,
  energy: number,
  dynamics: number,
  width: number,
  density: number,
  compression: number,
  loudness: number,
): Features => ({ brightness, warmth, energy, dynamics, width, density, compression, loudness });

const PLEX = "IBMPlexMono-Medium.ttf";
const PLEX_LIGHT = "IBMPlexMono-Regular.ttf";

export const FINISHES: Record<FinishId, Finish> = {
  neon: {
    name: "Neon Night",
    mood: "bright, loud, modern music",
    hour: {
      name: "after midnight",
      sky: ["#05030f", "#1a0b3b", "#5b1a6e", "#e0457b", "#ff8f5a"],
      sun: "#ffb27a",
    },
    palette: {
      base: "#0d0a16",
      cut: "#ff8cc0",
      glow: "#ff5c8a",
      accent: "#46e0ff",
      ink: "#f7ecdf",
      paper: "#0b0913",
    },
    material: "acrylic",
    type: { engrave: "Unbounded-700.ttf", small: PLEX, tracking: 0.01, uppercase: true },
    line: "ribbon",
    pattern: "grid",
    suits: f(0.58, 0.48, 0.55, 0.48, 0.58, 0.58, 0.55, 0.95),
  },
  ember: {
    name: "Ember",
    mood: "hard-hitting, tightly mixed music",
    hour: {
      name: "last light",
      sky: ["#0b0706", "#2a1208", "#6b260f", "#d2561d", "#ffb067"],
      sun: "#ffd08a",
    },
    palette: {
      base: "#1d1d22",
      cut: "#ff9a5c",
      glow: "#ff6b2c",
      accent: "#ffc26b",
      ink: "#f4ece4",
      paper: "#120f10",
    },
    material: "anodised",
    type: { engrave: "BigShouldersDisplay-800.ttf", small: PLEX, tracking: 0.03, uppercase: true },
    line: "bars",
    pattern: "pinstripe",
    suits: f(0.62, 0.25, 0.55, 0.42, 0.6, 0.58, 0.95, 0.85),
  },
  golden: {
    name: "Golden Hour",
    mood: "warm, organic, acoustic music",
    hour: {
      name: "golden hour",
      sky: ["#2b1a3a", "#7a3f58", "#d9785a", "#f6b56c", "#ffe2a6"],
      sun: "#fff1c4",
    },
    palette: {
      base: "#c99f60",
      cut: "#3a2312",
      glow: "#ffd391",
      accent: "#7a4a22",
      ink: "#2a1a0e",
      paper: "#f6ead4",
    },
    material: "brass",
    type: { engrave: "Fraunces-600.ttf", small: "Syne-400.ttf", tracking: 0, uppercase: false },
    line: "echo",
    pattern: "sunburst",
    suits: f(0.3, 0.75, 0.42, 0.58, 0.42, 0.42, 0.65, 0.78),
  },
  velvet: {
    name: "Velvet Room",
    mood: "quiet, spacious, delicate music",
    hour: {
      name: "late evening",
      sky: ["#0c0614", "#24123a", "#4b2357", "#8a4a6e", "#d79a8a"],
      sun: "#f6c9a0",
    },
    palette: {
      base: "#2b1631",
      cut: "#ecd09a",
      glow: "#f1d39b",
      accent: "#c79bd1",
      ink: "#f4e8de",
      paper: "#160b1a",
    },
    material: "anodised",
    type: {
      engrave: "BodoniModa-Italic-500.ttf",
      small: "BodoniModa-400.ttf",
      tracking: 0,
      uppercase: false,
    },
    line: "single",
    pattern: "rings",
    suits: f(0.05, 0.92, 0.15, 0.9, 0.78, 0.2, 0.05, 0.12),
  },
  tide: {
    name: "Tide Pool",
    mood: "airy, open, flowing music",
    hour: { name: "blue hour", sky: ["#04121a", "#0b3445", "#156a7a", "#5fc4c0", "#f2d6a0"], sun: "#fff0c8" },
    palette: {
      base: "#10505a",
      cut: "#d4fff6",
      glow: "#46e0ff",
      accent: "#7ef0d8",
      ink: "#eafcf8",
      paper: "#06232a",
    },
    material: "glass",
    type: { engrave: "Syne-700.ttf", small: "Syne-400.ttf", tracking: 0, uppercase: false },
    line: "ridges",
    pattern: "waves",
    suits: f(0.6, 0.45, 0.4, 0.62, 0.75, 0.4, 0.45, 0.6),
  },
  salt: {
    name: "Salt Flat",
    mood: "minimal, quiet, unhurried music",
    hour: {
      name: "white noon",
      sky: ["#c9d6e3", "#e6e4e0", "#f3e6d6", "#f6d4b8", "#fbe9d0"],
      sun: "#ffffff",
    },
    palette: {
      base: "#ece7df",
      cut: "#2f2c2a",
      glow: "#a89f95",
      accent: "#c96f4a",
      ink: "#2a2624",
      paper: "#f6f2ec",
    },
    material: "ceramic",
    type: { engrave: PLEX, small: PLEX_LIGHT, tracking: 0.02, uppercase: true },
    line: "dots",
    pattern: "dots",
    suits: f(0.45, 0.55, 0.25, 0.75, 0.5, 0.25, 0.25, 0.35),
  },
  aurora: {
    name: "Aurora",
    mood: "shimmering, wide, atmospheric music",
    hour: {
      name: "polar night",
      sky: ["#0a1130", "#1d2f6b", "#3a6aa8", "#7fd0c2", "#d9f2e6"],
      sun: "#f0fff8",
    },
    palette: {
      base: "#e7e1f1",
      cut: "#3f3466",
      glow: "#b9a6ff",
      accent: "#6fd3c8",
      ink: "#2a2445",
      paper: "#f4f1fa",
    },
    material: "pearl",
    type: { engrave: "Syne-400.ttf", small: "Syne-400.ttf", tracking: 0.01, uppercase: false },
    line: "ribbon",
    pattern: "none",
    suits: f(0.75, 0.4, 0.45, 0.6, 0.85, 0.45, 0.4, 0.65),
  },
  obsidian: {
    name: "Obsidian",
    mood: "dark, heavy, dense music",
    hour: { name: "moonless", sky: ["#020205", "#0b0d18", "#1c2238", "#3a4366", "#7a6f9a"], sun: "#c8d0ff" },
    palette: {
      base: "#09090c",
      cut: "#d3d7e0",
      glow: "#9fb0d6",
      accent: "#ff5c8a",
      ink: "#eef0f6",
      paper: "#050507",
    },
    material: "glass",
    type: { engrave: "BigShouldersDisplay-400.ttf", small: PLEX_LIGHT, tracking: 0.06, uppercase: true },
    line: "ridges",
    pattern: "pinstripe",
    suits: f(0.3, 0.35, 0.75, 0.3, 0.4, 0.8, 0.9, 0.95),
  },
  chrome: {
    name: "Chrome",
    mood: "crisp, bright, electronic music",
    hour: {
      name: "noon glare",
      sky: ["#0e1626", "#24406b", "#6fa0d8", "#d6e6f6", "#ffffff"],
      sun: "#ffffff",
    },
    palette: {
      base: "#d9dde4",
      cut: "#1b1e25",
      glow: "#ffffff",
      accent: "#3d8bff",
      ink: "#1b1e25",
      paper: "#eef1f5",
    },
    material: "chrome",
    type: { engrave: "Unbounded-300.ttf", small: "Unbounded-300.ttf", tracking: 0.04, uppercase: true },
    line: "single",
    pattern: "none",
    suits: f(0.85, 0.25, 0.7, 0.35, 0.6, 0.65, 0.85, 0.9),
  },
  jade: {
    name: "Jade Garden",
    mood: "gentle, earthy, natural music",
    hour: {
      name: "rain-washed dusk",
      sky: ["#0a1a14", "#1b3a2f", "#3e6b4f", "#a6b77a", "#f3dfa6"],
      sun: "#fff3c8",
    },
    palette: {
      base: "#2e6a57",
      cut: "#efe0ae",
      glow: "#b6f0c8",
      accent: "#d5ad62",
      ink: "#f2efe0",
      paper: "#123128",
    },
    material: "ceramic",
    type: { engrave: "Fraunces-Italic-400.ttf", small: "Fraunces-400.ttf", tracking: 0, uppercase: false },
    line: "echo",
    pattern: "waves",
    suits: f(0.42, 0.62, 0.3, 0.68, 0.6, 0.35, 0.4, 0.5),
  },
  coral: {
    name: "Coral Coast",
    mood: "sunny, upbeat, feel-good music",
    hour: {
      name: "beach sunset",
      sky: ["#1a2a5a", "#5a4a8a", "#e07a8a", "#ffb38a", "#ffe0b0"],
      sun: "#fff4d8",
    },
    palette: {
      base: "#ef8b75",
      cut: "#fff5ec",
      glow: "#ffd0c0",
      accent: "#3a6ab8",
      ink: "#3a1a14",
      paper: "#fde9df",
    },
    material: "acrylic",
    type: { engrave: "Syne-700.ttf", small: PLEX_LIGHT, tracking: 0, uppercase: false },
    line: "dots",
    pattern: "rings",
    suits: f(0.62, 0.62, 0.65, 0.45, 0.5, 0.55, 0.7, 0.85),
  },
  midnight: {
    name: "Midnight Drive",
    mood: "smooth, steady, late-night music",
    hour: {
      name: "city midnight",
      sky: ["#05071a", "#141a3c", "#2b2f6b", "#6b4a7a", "#d58a7a"],
      sun: "#ffd6a8",
    },
    palette: {
      base: "#151b3d",
      cut: "#dcb46c",
      glow: "#f1d39b",
      accent: "#ebaa9a",
      ink: "#f2e8d6",
      paper: "#0b0f24",
    },
    material: "anodised",
    type: { engrave: "BodoniModa-400.ttf", small: PLEX_LIGHT, tracking: 0.02, uppercase: true },
    line: "single",
    pattern: "grid",
    suits: f(0.4, 0.5, 0.6, 0.45, 0.55, 0.6, 0.75, 0.88),
  },
  sakura: {
    name: "Sakura",
    mood: "soft, sweet, melodic music",
    hour: {
      name: "spring evening",
      sky: ["#2a1a3a", "#6a3a6a", "#d6869a", "#f6c0c4", "#fff0e6"],
      sun: "#fff6ee",
    },
    palette: {
      base: "#f3d0d6",
      cut: "#74304a",
      glow: "#ffb3c7",
      accent: "#c89b6c",
      ink: "#4a1e2e",
      paper: "#fdf1f3",
    },
    material: "pearl",
    type: { engrave: "/book/fonts/Allura-Regular.ttf", small: "Syne-400.ttf", tracking: 0, uppercase: false },
    line: "echo",
    pattern: "dots",
    suits: f(0.6, 0.58, 0.32, 0.6, 0.6, 0.35, 0.5, 0.6),
  },
  ultraviolet: {
    name: "Ultraviolet",
    mood: "intense, fast, high-energy music",
    hour: {
      name: "strobe hour",
      sky: ["#06020f", "#1c0838", "#4a1a8a", "#a83ad0", "#ff6fb0"],
      sun: "#ffd0f0",
    },
    palette: {
      base: "#2a0f4f",
      cut: "#8af7ff",
      glow: "#46e0ff",
      accent: "#ff5c8a",
      ink: "#f2eaff",
      paper: "#12061f",
    },
    material: "acrylic",
    type: { engrave: "Unbounded-700.ttf", small: "Unbounded-300.ttf", tracking: 0.02, uppercase: true },
    line: "bars",
    pattern: "sunburst",
    suits: f(0.7, 0.3, 0.8, 0.3, 0.55, 0.75, 0.92, 0.97),
  },
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fmt = (v: number, d = 2) => v.toFixed(d);

/** A library's measured character, in the terms finishes are described in. */
export function features(lib: Library): Features {
  const d = (k: string) => lib.descriptors[k]?.median ?? 0.5;
  const lufs = lib.measures.integrated_lufs?.median ?? -12;
  const lra = lib.measures.loudness_range_lu?.median ?? 7;
  return {
    brightness: d("brightness"),
    warmth: d("warmth"),
    energy: d("energy"),
    dynamics: d("dynamics"),
    width: d("width"),
    density: d("density"),
    compression: 1 - clamp01((lra - 3) / 10),
    loudness: clamp01((lufs + 24) / 16),
  };
}

function distance(a: Features, b: Features) {
  return (Object.keys(a) as (keyof Features)[]).reduce((s, k) => s + (a[k] - b[k]) ** 2, 0);
}

/** Every finish, nearest first, for this library. */
export function rankFinishes(lib: Library): FinishId[] {
  const mine = features(lib);
  return [...FINISH_IDS].sort(
    (a, b) => distance(mine, FINISHES[a].suits) - distance(mine, FINISHES[b].suits),
  );
}

export function commission(lib: Library, choice?: FinishId): ArtDirection {
  const nearest = rankFinishes(lib)[0];
  const family = choice ?? nearest;
  const finish = FINISHES[family];
  const m = features(lib);
  const lufs = lib.measures.integrated_lufs?.median ?? -12;
  const lra = lib.measures.loudness_range_lu?.median ?? 7;
  const colophon: ArtDirection["colophon"] = [
    {
      decision: `${finish.name}${choice && choice !== nearest ? " (chosen by the listener)" : ""}`,
      because:
        choice && choice !== nearest
          ? `picked over ${FINISHES[nearest].name}, the finish nearest this music`
          : `the nearest of ${FINISH_IDS.length} finishes to this music: brightness ${fmt(m.brightness)}, warmth ${fmt(m.warmth)}, energy ${fmt(m.energy)}, dynamics ${fmt(m.dynamics)}, width ${fmt(m.width)}`,
    },
    {
      decision: `Mixing: ${m.compression > 0.7 ? "tight" : m.compression < 0.3 ? "open" : "moderate"}`,
      because: `${fmt(lra, 1)} LU loudness range, ${fmt(lufs, 1)} LUFS`,
    },
    {
      decision: `${finish.material} stock, ${finish.line} line`,
      because: `the finish suits ${finish.mood} (density ${fmt(m.density)})`,
    },
    {
      decision: `The line is the listener's sound`,
      because: `six tonal dimensions of their sound profile, in dB against the reference target (${lib.trackCount} songs)`,
    },
  ];
  return { family, colophon, ...finish };
}
