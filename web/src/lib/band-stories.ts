import type { BandKey } from "./bands";

/**
 * The perceptual vocabulary of each band, in listener language. These are general
 * audio-engineering descriptions, not claims about any particular listener or earphone.
 */
export type BandStory = {
  hear: string;
  more: string;
  less: string;
  where: string;
};

export const BAND_STORIES: Record<BandKey, BandStory> = {
  sub_bass: {
    hear: "the rumble you feel",
    more: "Physical, cinematic weight",
    less: "Cleaner, but lighter underneath",
    where: "808s, synth bass, organ pedals, film scores",
  },
  mid_bass: {
    hear: "punch and body",
    more: "Thick, powerful kicks",
    less: "Tight, lean and fast",
    where: "Kick drums, bass guitar, cello",
  },
  lower_mids: {
    hear: "warmth and fullness",
    more: "Rich and full, or muddy when overdone",
    less: "Clean, or thin when overdone",
    where: "Male vocals, the body of guitars, piano",
  },
  mids: {
    hear: "the core of every voice",
    more: "Dense and forward",
    less: "Hollow and distant",
    where: "Lead vocals, snare, horns",
  },
  upper_mids: {
    hear: "clarity and forwardness",
    more: "Vivid, close vocals, or shouty",
    less: "Relaxed, or veiled",
    where: "Vocal intelligibility, guitar bite",
  },
  presence: {
    hear: "bite and definition",
    more: "Crisp and detailed, can tire the ear",
    less: "Smooth and soft-edged",
    where: "Consonants, pick attack, snare crack",
  },
  lower_treble: {
    hear: "cymbals and sibilance",
    more: "Sparkly, or sharp “s” sounds",
    less: "Dark and relaxed",
    where: "Hi-hats, cymbals, sibilants",
  },
  upper_treble: {
    hear: "sparkle and fine detail",
    more: "Airy detail, or glare",
    less: "Soft and rounded",
    where: "Cymbal shimmer, string harmonics",
  },
  air: {
    hear: "openness and space",
    more: "Open and spacious",
    less: "Closed-in and intimate",
    where: "Room ambience, breath, reverb tails",
  },
};
