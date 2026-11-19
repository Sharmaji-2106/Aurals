"use client";

import {
  ESTABLISH,
  WIDE,
  markFor,
  type BoutiqueProduct,
  type Mark,
  type Phase,
} from "@/components/boutique/contract";
import { useCallback, useMemo, useState } from "react";

/**
 * What the boutique is doing.
 *
 * The camera's goal is derived from the state rather than stored beside it, so
 * the two cannot disagree. Opening the overlay does not touch the camera at
 * all: it is a phase, and closing it returns to the state it opened from
 * because that state was never overwritten.
 */

export type Boutique = {
  phase: Phase;
  selected: BoutiqueProduct | null;
  hovered: BoutiqueProduct | null;
  mark: Mark;
  showLabels: boolean;
  select(slug: string): void;
  hover(slug: string | null): void;
  focusRecommended(): void;
  showWall(): void;
  reset(): void;
  openOverlay(): void;
  closeOverlay(): void;
  toggleLabels(): void;
};

export function useBoutique(products: readonly BoutiqueProduct[]): Boutique {
  const [phase, setPhase] = useState<Phase>("establishing");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);

  const bySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);
  const recommended = useMemo(() => products.find((p) => p.hero) ?? products[0], [products]);

  const selected = selectedSlug ? (bySlug.get(selectedSlug) ?? null) : null;
  const hovered = hoveredSlug ? (bySlug.get(hoveredSlug) ?? null) : null;

  // One goal, derived. The overlay deliberately does not appear here: it sits
  // over whatever the camera was already looking at.
  const mark = useMemo<Mark>(() => {
    if (phase === "establishing") return ESTABLISH;
    if (phase === "browsing") return WIDE;
    return selected ? markFor(selected) : ESTABLISH;
  }, [phase, selected]);

  const select = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setPhase("focused");
  }, []);

  const hover = useCallback((slug: string | null) => setHoveredSlug(slug), []);

  const focusRecommended = useCallback(() => {
    if (!recommended) return;
    setSelectedSlug(recommended.slug);
    setPhase("focused");
  }, [recommended]);

  const showWall = useCallback(() => setPhase("browsing"), []);

  const reset = useCallback(() => {
    setSelectedSlug(null);
    setHoveredSlug(null);
    setPhase("establishing");
  }, []);

  const openOverlay = useCallback(() => {
    setSelectedSlug((current) => current ?? recommended?.slug ?? null);
    setPhase((current) => {
      // If nothing has been focused yet, going straight to the overlay should
      // still leave the camera somewhere sensible behind it.
      return current === "overlay" ? current : "overlay";
    });
  }, [recommended]);

  const closeOverlay = useCallback(() => {
    setPhase((current) => (current === "overlay" ? "focused" : current));
  }, []);

  const toggleLabels = useCallback(() => setShowLabels((on) => !on), []);

  return {
    phase,
    selected,
    hovered,
    mark,
    showLabels,
    select,
    hover,
    focusRecommended,
    showWall,
    reset,
    openOverlay,
    closeOverlay,
    toggleLabels,
  };
}
