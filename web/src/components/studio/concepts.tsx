"use client";

import type { ComponentType } from "react";
import { ArtworkInMotion } from "./concept-artwork";
import { ConcentricMotion } from "./concept-concentric";
import { Convergence, GRAIN_PATTERNS } from "./concept-convergence";
import { DoubleOrbit } from "./concept-double-orbit";
import { SoundPropagation } from "./concept-propagation";
import type { Sequence } from "./sequence";

export type Concept = {
  id: string;
  index: string;
  title: string;
  /** One line, in the voice of a studio presenting work. */
  line: string;
  /** What the viewer should be watching for. */
  note: string;
  technique: string;
  headphones: string;
  /** Alternatives within the concept, switchable on the same clock. */
  variants?: { readonly id: string; readonly label: string }[];
  variantLabel?: string;
  Scene: ComponentType<{ seq: Sequence; variant?: string }>;
};

export const CONCEPTS: Concept[] = [
  {
    id: "double-orbit",
    index: "01",
    title: "Double Orbit",
    line: "One playlist, two rings. The outer is a true duplicate of the inner, and it is the one that leaves.",
    note: "Watch the outer ring widen and release while the inner ring holds its original behaviour.",
    technique: "SVG + compositor transforms",
    headphones: "Traced line",
    Scene: DoubleOrbit,
  },
  {
    id: "concentric",
    index: "02",
    title: "Concentric Motion",
    line: "Five paths at five rates. Covers ride the middle two; the outer rings carry only marks.",
    note: "The rings dissolve from the outside in, each on its own beat, never together.",
    technique: "Canvas 2D",
    headphones: "Collapsing rings",
    Scene: ConcentricMotion,
  },
  {
    id: "propagation",
    index: "03",
    title: "Sound Propagation",
    line: "Three emitters, one room. Wavefronts leave the playlist, cross, and give out at the walls.",
    note: "Interference is real here — the bright arcs are where two fronts meet.",
    technique: "WebGL fragment shader",
    headphones: "Filament",
    Scene: SoundPropagation,
  },
  {
    id: "artwork",
    index: "04",
    title: "Artwork in Motion",
    line: "The covers are the subject: a composed spread across three depth planes, drawn to one point.",
    note: "The camera eases forward through the whole piece; nothing cuts.",
    technique: "CSS 3D",
    headphones: "Dimensional",
    Scene: ArtworkInMotion,
  },
  {
    id: "convergence",
    index: "05",
    title: "The Shape of Your Sound",
    line: "A wall of covers rides past the camera, comes apart into grain, and is drawn across the frame into the object.",
    note: "Three things the grain can do in between — a vibrating plate, smoke, or scrolling signal rows. Switch between them on the same clock.",
    technique: "WebGL points · 18k grains",
    headphones: "Grain resolving into stroke",
    variants: [...GRAIN_PATTERNS],
    variantLabel: "Grain",
    Scene: Convergence,
  },
];

export const conceptById = (id: string) => CONCEPTS.find((c) => c.id === id) ?? CONCEPTS[0];
