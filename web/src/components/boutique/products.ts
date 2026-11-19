import type { BoutiqueProduct } from "@/components/boutique/contract";

/**
 * The collection on display, and what Auralis actually knows about it.
 *
 * Development data for an isolated route, but not invented data: every one of
 * these is a real earphone in the catalogue, and the rank, score, interval,
 * match grade and reasons are the output of an actual run of the engine
 * (`harman-personal/1`, against the Harman in-ear 2019 target, over all 203
 * measured earphones). The curve is each one's own measured frequency
 * response, downsampled from its stored points for drawing.
 *
 * `anchor` is where that product's display stands in the boutique, in metres,
 * read out of the Blender build so the camera can be sent to it without
 * anything being measured twice or guessed. Blender is Z-up and three.js is
 * Y-up, so the conversion happens once, here.
 *
 * There is not one product photograph in this catalogue — the measurement
 * files carry none — so nothing here claims to show you an earphone.
 */
export const BOUTIQUE_PRODUCTS: readonly BoutiqueProduct[] = [
  {
    slug: "truthear-x-crinacle-zero-red",
    rank: 1,
    brand: "Truthear",
    model: "x Crinacle Zero RED",
    match: "close",
    mean: 84.6,
    low: 79.7,
    high: 89.2,
    strength:
      "Treble: within 0.1 dB of your target, inside your \u00b11.6 dB range; your target here is -2.1 dB from the reference, from your answers.",
    tradeoff:
      "Expected rating 85 across the targets your evidence allows (80% range 80-89); 86 for the average listener against the reference target. Olive et al. in-ear model, 0-100 scale.",
    measuredBy: "oratory1990 (via AutoEq)",
    rig: "GRAS 43ACB",
    points: 695,
    curve: [
      6.2, 6.09, 6.18, 6.27, 6.23, 6.04, 5.88, 5.73, 5.53, 5.3, 5.03, 4.72, 4.37, 3.96, 3.47, 2.9, 2.39, 1.73,
      1.05, 0.36, -0.3, -0.72, -1.08, -1.27, -1.36, -1.27, -1.18, -1.08, -0.99, -0.94, -0.9, -0.9, -0.94,
      -0.99, -1.04, -1.08, -1.08, -1.04, -0.85, -0.58, -0.13, 0.49, 1.08, 1.54, 2.1, 2.88, 3.58, 4.22, 4.9,
      5.72, 6.52, 7.18, 7.58, 7.67, 7.28, 6.59, 5.71, 4.74, 3.63, 2.92, 3.14, 4.18, 4.53, -0.1, -5.0, -5.92,
      -4.59, 0.12, -7.13, -8.14, -12.89, -19.97,
    ],
    niche: 3,
    hero: true,
    anchor: [0.16, 1.144, -0.1225],
  },
  {
    slug: "7hz-salnotes-zero",
    rank: 2,
    brand: "7Hz",
    model: "Salnotes Zero",
    match: "close",
    mean: 81.7,
    low: 76.6,
    high: 87.2,
    strength:
      "Treble: within 0.4 dB of your target, inside your \u00b11.6 dB range; your target here is -2.1 dB from the reference, from your answers.",
    tradeoff:
      "Expected rating 82 across the targets your evidence allows (80% range 77-87); 84 for the average listener against the reference target. Olive et al. in-ear model, 0-100 scale.",
    measuredBy: "oratory1990 (via AutoEq)",
    rig: "GRAS 43AC",
    points: 695,
    curve: [
      7.0, 6.97, 6.93, 6.8, 6.68, 6.46, 6.23, 6.08, 5.77, 5.48, 5.12, 4.76, 4.44, 4.06, 3.63, 3.2, 2.92, 2.5,
      2.11, 1.76, 1.38, 1.07, 0.83, 0.54, 0.27, 0.04, -0.2, -0.43, -0.52, -0.62, -0.71, -0.8, -0.85, -0.94,
      -0.99, -0.99, -0.99, -0.94, -0.84, -0.58, -0.13, 0.6, 1.61, 2.48, 3.32, 4.03, 4.75, 5.58, 6.37, 7.22,
      7.97, 8.49, 8.6, 8.38, 7.77, 6.99, 6.11, 5.2, 4.12, 3.34, 3.29, 4.4, 3.95, -2.5, -6.89, -6.8, -3.17,
      -1.43, -5.47, -8.83, -13.06, -19.22,
    ],
    niche: 0,
    hero: false,
    anchor: [-1.19, 1.636, -0.105],
  },
  {
    slug: "hidition-viento",
    rank: 3,
    brand: "Hidition",
    model: "Viento",
    match: "close",
    mean: 81.0,
    low: 75.1,
    high: 86.0,
    strength:
      "Treble: within 0.2 dB of your target, inside your \u00b11.6 dB range; your target here is -2.1 dB from the reference, from your answers.",
    tradeoff:
      "Expected rating 81 across the targets your evidence allows (80% range 75-86); 79 for the average listener against the reference target. Olive et al. in-ear model, 0-100 scale.",
    measuredBy: "oratory1990 (via AutoEq)",
    rig: "GRAS 45BC",
    points: 695,
    curve: [
      6.22, 6.36, 6.46, 6.46, 6.23, 5.94, 5.74, 5.49, 5.18, 4.92, 4.61, 4.2, 3.81, 3.45, 3.07, 2.83, 2.52,
      2.22, 2.03, 1.73, 1.56, 1.34, 1.15, 1.1, 1.06, 0.92, 0.8, 0.68, 0.64, 0.54, 0.48, 0.41, 0.31, 0.22,
      0.17, 0.03, -0.11, -0.32, -0.43, -0.48, -0.14, 0.69, 1.76, 2.72, 3.57, 4.25, 4.95, 5.8, 6.62, 7.66,
      8.73, 9.48, 9.36, 8.3, 7.21, 6.57, 5.67, 4.59, 4.1, 4.79, 5.14, 4.68, 6.31, 4.2, -5.21, -7.28, -8.05,
      -5.82, -1.14, -2.4, -3.19, -7.14,
    ],
    niche: 1,
    hero: false,
    anchor: [-1.26, 1.051, -0.105],
  },
  {
    slug: "samsung-galaxy-buds2-pro",
    rank: 4,
    brand: "Samsung",
    model: "Galaxy Buds2 Pro",
    match: "close",
    mean: 80.2,
    low: 72.4,
    high: 87.2,
    strength:
      "Treble: within 0.4 dB of your target, inside your \u00b11.6 dB range; your target here is -2.1 dB from the reference, from your answers.",
    tradeoff:
      "Expected rating 80 across the targets your evidence allows (80% range 72-87); 85 for the average listener against the reference target. Olive et al. in-ear model, 0-100 scale.",
    measuredBy: "oratory1990 (via AutoEq)",
    rig: "GRAS 43AC",
    points: 695,
    curve: [
      9.51, 9.49, 9.47, 9.49, 9.47, 9.28, 9.0, 8.64, 8.19, 7.74, 7.3, 6.84, 6.44, 5.98, 5.5, 4.97, 4.46, 3.87,
      3.25, 2.64, 2.09, 1.63, 1.16, 0.81, 0.57, 0.44, 0.41, 0.41, 0.44, 0.44, 0.39, 0.24, 0.0, -0.17, -0.17,
      -0.03, 0.29, 0.67, 0.74, 0.32, -0.08, 0.77, 2.07, 2.91, 3.39, 4.03, 4.76, 5.35, 5.81, 6.71, 8.17, 9.8,
      10.94, 10.98, 9.62, 8.79, 8.68, 8.53, 7.05, 5.29, 4.6, 3.68, -0.44, -1.99, -1.47, 0.44, 1.95, 0.29,
      -0.46, -5.72, -11.37, -15.04,
    ],
    niche: 2,
    hero: false,
    anchor: [-1.02, 0.526, -0.095],
  },
  {
    slug: "moondrop-chu",
    rank: 5,
    brand: "Moondrop",
    model: "Chu",
    match: "close",
    mean: 80.1,
    low: 73.9,
    high: 85.4,
    strength:
      "Treble: within 1.4 dB of your target, inside your \u00b11.6 dB range; your target here is -2.1 dB from the reference, from your answers.",
    tradeoff:
      "Vocals and presence: 1.0 dB above your target (more forward vocals), outside your \u00b11.0 dB range.",
    measuredBy: "oratory1990 (via AutoEq)",
    rig: "GRAS 43AC",
    points: 695,
    curve: [
      5.96, 6.03, 6.03, 5.98, 5.89, 5.75, 5.61, 5.43, 5.24, 4.86, 4.58, 4.26, 3.91, 3.32, 3.0, 2.91, 2.56,
      2.39, 2.07, 1.88, 1.51, 1.23, 0.91, 0.58, 0.27, 0.02, -0.21, -0.4, -0.58, -0.77, -0.86, -1.0, -1.09,
      -1.19, -1.21, -1.23, -1.21, -1.14, -0.87, -0.55, -0.12, 0.71, 1.75, 2.61, 3.4, 4.13, 4.94, 5.84, 6.68,
      7.6, 8.46, 8.82, 8.73, 8.22, 7.6, 7.12, 6.87, 6.68, 6.24, 5.46, 4.82, 5.13, 4.96, -0.15, -5.85, -9.06,
      -6.89, -3.82, -0.24, -3.86, -9.02, -15.4,
    ],
    niche: 4,
    hero: false,
    anchor: [1.2, 1.701, -0.105],
  },
  {
    slug: "akg-n5005",
    rank: 6,
    brand: "AKG",
    model: "N5005",
    match: "good",
    mean: 79.9,
    low: 74.8,
    high: 84.5,
    strength:
      "Treble: within 1.1 dB of your target, inside your \u00b11.6 dB range; your target here is -2.1 dB from the reference, from your answers.",
    tradeoff: "Treble sits 1.1 dB above your target, and you told us bright sound tends to tire you.",
    measuredBy: "oratory1990 (via AutoEq)",
    rig: "GRAS 43AC",
    points: 695,
    curve: [
      8.35, 8.54, 8.68, 8.72, 8.63, 8.54, 8.35, 8.17, 7.93, 7.62, 7.27, 6.86, 6.42, 5.86, 5.3, 4.69, 4.13,
      3.48, 2.88, 2.31, 1.86, 1.53, 1.22, 1.03, 0.84, 0.7, 0.66, 0.61, 0.52, 0.47, 0.42, 0.38, 0.28, 0.24,
      0.17, 0.05, -0.04, -0.11, -0.16, -0.23, -0.09, 0.53, 1.59, 2.66, 3.68, 4.59, 5.56, 6.77, 7.98, 9.25,
      9.89, 9.75, 9.47, 9.16, 9.0, 9.81, 10.79, 9.8, 7.08, 5.22, 5.75, 8.16, 6.17, -1.21, -5.91, -5.97, -4.19,
      -3.84, -4.07, -3.47, -5.03, -7.11,
    ],
    niche: 5,
    hero: false,
    anchor: [1.3, 1.096, -0.105],
  },
  {
    slug: "huawei-freebuds-pro-2",
    rank: 7,
    brand: "Huawei",
    model: "Freebuds Pro 2",
    match: "good",
    mean: 79.9,
    low: 74.5,
    high: 85.1,
    strength:
      "Treble: within 1.2 dB of your target, inside your \u00b11.6 dB range; your target here is -2.1 dB from the reference, from your answers.",
    tradeoff:
      "Vocals and presence: 1.4 dB above your target (more forward vocals), outside your \u00b11.0 dB range.",
    measuredBy: "oratory1990 (via AutoEq)",
    rig: "GRAS 43AC",
    points: 695,
    curve: [
      4.96, 5.22, 5.53, 5.73, 5.87, 5.94, 5.91, 5.78, 5.53, 5.17, 4.69, 4.06, 3.36, 2.44, 1.44, 0.36, -0.62,
      -1.71, -2.68, -3.42, -3.9, -4.04, -3.96, -3.71, -3.4, -3.21, -3.11, -3.11, -3.21, -3.25, -3.25, -3.25,
      -3.25, -3.16, -2.97, -2.69, -2.35, -1.95, -1.47, -0.93, -0.18, 0.67, 1.4, 1.94, 2.4, 2.78, 3.18, 3.92,
      4.73, 5.66, 6.52, 7.06, 7.13, 6.72, 6.04, 5.48, 5.38, 6.18, 5.9, 3.89, 2.89, 2.32, -1.11, -2.51, -7.32,
      -9.26, -8.3, -3.11, 0.62, -2.97, -6.62, -28.86,
    ],
    niche: 6,
    hero: false,
    anchor: [1.12, 0.546, -0.095],
  },
];

/** How many measured earphones the ranking was drawn from. */
export const MEASURED_COUNT = 203;

/** Which model produced the scores, named on screen wherever they appear. */
export const RECOMMENDER = "harman-personal/1";

/** The target the personal curve was built from. */
export const REFERENCE_TARGET = "Harman in-ear 2019";
