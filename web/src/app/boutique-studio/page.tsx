"use client";

import { RecommendationOverlay } from "@/components/boutique/overlay";
import { BOUTIQUE_PRODUCTS, MEASURED_COUNT } from "@/components/boutique/products";
import { useBoutique } from "@/components/boutique/use-boutique";
import { cn } from "@/lib/cn";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * The environment loads in the browser only.
 *
 * It needs a GPU, a device-pixel ratio and a pointer type to decide how hard to
 * work, none of which exist on a server — and rendering three.js there would
 * put the whole library in the server bundle to produce markup that is thrown
 * away on hydration.
 */
const Boutique = dynamic(() => import("@/components/boutique/boutique").then((m) => m.Boutique), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-[#08090C]">
      <p className="font-mono text-[10px] tracking-[0.26em] text-ink-faint uppercase">Opening the boutique</p>
    </div>
  ),
});

/**
 * The Boutique studio.
 *
 * An isolated route, so the environment can be walked through and measured
 * without going through onboarding, a questionnaire and a music analysis first.
 * It is a development surface: the collection is a captured snapshot of a real
 * engine run, labelled as such here and in the overlay.
 */
export default function BoutiqueStudioPage() {
  const boutique = useBoutique(BOUTIQUE_PRODUCTS);
  const [debug, setDebug] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // Escape always leaves the overlay, as it does everywhere else in this
  // product.
  const { closeOverlay, phase } = boutique;
  useEffect(() => {
    if (phase !== "overlay") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, closeOverlay]);

  const label = boutique.hovered ?? boutique.selected;

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-[#08090C]"
      data-phase={boutique.phase}
      data-selected={boutique.selected?.slug ?? ""}
    >
      <Boutique
        products={BOUTIQUE_PRODUCTS}
        mark={boutique.mark}
        hovered={boutique.hovered?.slug ?? null}
        selected={boutique.selected?.slug ?? null}
        onHover={boutique.hover}
        onSelect={boutique.select}
      />

      {/* Identity, and an unambiguous statement of what this page is. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-6 p-6 sm:p-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ink-faint uppercase">AURALS</p>
          <h1 className="display mt-1.5 text-[20px] leading-none tracking-[-0.02em] text-ink">
            The Boutique
          </h1>
          <p className="numeric mt-2 text-[10.5px] text-ink-faint">
            {BOUTIQUE_PRODUCTS.length} on display &middot; drawn from {MEASURED_COUNT} measured earphones
          </p>
        </div>
        <p className="rounded-full border border-ember/35 bg-ember/10 px-2.5 py-1 font-mono text-[9.5px] tracking-[0.22em] text-ember uppercase">
          Development demo
        </p>
      </div>

      {/* The contextual label. Appears beside what is being looked at, says what
          it is, and never covers it. */}
      <AnimatePresence>
        {boutique.showLabels && label && boutique.phase !== "overlay" && (
          <motion.div
            key={label.slug}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute bottom-40 left-4 z-20 rounded-xl border border-hairline bg-[#0A0B0E]/82 px-4 py-3 backdrop-blur-md sm:bottom-32 sm:left-8"
          >
            <p className="font-mono text-[9px] tracking-[0.26em] text-ink-faint uppercase">{label.brand}</p>
            <p className="display mt-1 text-[15px] leading-tight text-ink">{label.model}</p>
            <p className="numeric mt-1.5 text-[10px] text-ember">
              {label.mean.toFixed(1)}{" "}
              <span className="text-ink-faint">
                ({label.low.toFixed(1)}&ndash;{label.high.toFixed(1)})
              </span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {boutique.phase === "overlay" && boutique.selected && (
          <RecommendationOverlay product={boutique.selected} onClose={boutique.closeOverlay} />
        )}
      </AnimatePresence>

      {/* The primary action, offered once the camera has arrived somewhere. */}
      <AnimatePresence>
        {boutique.phase === "focused" && boutique.selected && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center sm:bottom-32"
          >
            <button
              type="button"
              onClick={boutique.openOverlay}
              className="pointer-events-auto rounded-full border border-ember/55 bg-ember/12 px-5 py-2.5 text-[12.5px] text-ink shadow-lg backdrop-blur-md transition-colors hover:bg-ember/20"
            >
              View your recommendation
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {debug && (
        <div className="pointer-events-none absolute top-28 left-6 z-20 rounded-xl border border-hairline bg-black/70 p-3 font-mono text-[10px] leading-relaxed text-ink-muted backdrop-blur-sm sm:left-8">
          <p className="text-ember">{boutique.phase}</p>
          <p>selected {boutique.selected?.slug ?? "—"}</p>
          <p>hovered {boutique.hovered?.slug ?? "—"}</p>
          <p>
            camera {boutique.mark.position.map((n) => n.toFixed(2)).join(", ")} &middot; fov{" "}
            {boutique.mark.fov}
          </p>
          <p>target {boutique.mark.target.map((n) => n.toFixed(2)).join(", ")}</p>
          {reduced && <p className="text-ember-soft">reduced motion</p>}
        </div>
      )}

      <Controls boutique={boutique} debug={debug} onToggleDebug={() => setDebug((on) => !on)} />
    </main>
  );
}

/* --------------------------------------------------------------- controls --- */

function Chip({
  onClick,
  children,
  active,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-[11px] whitespace-nowrap transition-colors",
        active
          ? "border-ember/55 bg-ember/10 text-ink"
          : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Development controls. Every one is wired; none is decorative.
 */
function Controls({
  boutique,
  debug,
  onToggleDebug,
}: {
  boutique: ReturnType<typeof useBoutique>;
  debug: boolean;
  onToggleDebug: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 sm:p-6">
      {/* One row that scrolls, rather than three that wrap. Wrapping pushed the
          last row off the bottom of a phone, which put half the controls out of
          reach — and a control you cannot press is not a control. */}
      <div className="flex w-full max-w-[940px] [scrollbar-width:none] items-center gap-2 overflow-x-auto rounded-2xl border border-hairline bg-elevated/85 p-3 backdrop-blur-md sm:flex-wrap sm:justify-center sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        <Chip onClick={boutique.reset} active={boutique.phase === "establishing"}>
          Reset camera
        </Chip>
        <Chip onClick={boutique.showWall} active={boutique.phase === "browsing"}>
          Show full shelf
        </Chip>
        <Chip
          onClick={boutique.focusRecommended}
          active={boutique.phase === "focused" && Boolean(boutique.selected?.hero)}
        >
          Focus recommended
        </Chip>
        <Chip onClick={boutique.toggleLabels} active={boutique.showLabels}>
          Labels
        </Chip>
        <Chip onClick={onToggleDebug} active={debug}>
          Debug
        </Chip>

        <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />

        <Chip onClick={boutique.openOverlay} active={boutique.phase === "overlay"}>
          Open recommendation
        </Chip>
        <Chip onClick={boutique.closeOverlay}>Close</Chip>

        <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />

        {BOUTIQUE_PRODUCTS.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => boutique.select(p.slug)}
            onMouseEnter={() => boutique.hover(p.slug)}
            onMouseLeave={() => boutique.hover(null)}
            title={`${p.brand} ${p.model}`}
            className={cn(
              "numeric h-8 w-8 shrink-0 rounded-full border text-[11px] transition-colors",
              boutique.selected?.slug === p.slug
                ? "border-ember/55 bg-ember/10 text-ink"
                : "border-hairline-strong text-ink-faint hover:border-white/25 hover:text-ink",
            )}
          >
            {p.rank}
          </button>
        ))}
      </div>
    </div>
  );
}
