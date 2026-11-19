"use client";

import { Photograph } from "@/components/results/product-art";
import { ListenButton } from "@/components/listen/listening";
import { FrChart } from "@/components/store/fr-chart";
import { Plate } from "@/components/store/product-card";
import { ButtonLink } from "@/components/ui/button";
import { useStoreProduct } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import { usePalette } from "@/lib/palette";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

const KIND = { "in-ear": "In-ear monitor", earbuds: "Earbuds", headphones: "Headphones" } as const;
const ease = [0.16, 1, 0.3, 1] as const;

/**
 * One product, in full: its photographs on a backdrop in its own colours, where to
 * buy it in India (rupee listings first, cheapest first, each with when it was
 * seen), how it measures against the target, and — for a listener with a sound
 * profile — how it fits them, with the engine's own reasons.
 */
export function ProductView({ slug }: { slug: string }) {
  const product = useStoreProduct(slug);
  const [shown, setShown] = useState(0);
  const data = product.data;
  const images = data?.images ?? [];
  const palette = usePalette(images[0] ? `/api/iem-images/${images[0]}` : null);

  if (product.error) {
    return (
      <div className="pt-24">
        <p className="display text-[2rem] text-ink">That product isn&rsquo;t in the store.</p>
        <ButtonLink href="/store" variant="secondary" className="mt-6">
          <ArrowLeft className="size-4" /> Back to the store
        </ButtonLink>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-12 pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="skeleton aspect-[5/4] w-full rounded-[2rem]" />
        <div className="flex flex-col gap-4 pt-6">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-16 w-3/4 rounded-xl" />
          <div className="skeleton mt-6 h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const { item, offers, curve, recommendation } = data;
  const india = offers.filter((o) => o.currency === "INR");
  const elsewhere = offers.filter((o) => o.currency !== "INR");

  return (
    <div className="relative pt-8 pb-28 sm:pt-12">
      {/* The product's own light, behind everything. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[38rem] max-w-5xl rounded-[50%] opacity-40 blur-3xl transition-[background] duration-1000"
        style={{
          background: palette ? `radial-gradient(closest-side, ${palette.mid}, transparent)` : undefined,
        }}
      />
      <Link
        href="/store"
        className="inline-flex items-center gap-2 text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> The store
      </Link>

      <div className="mt-8 grid items-start gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* The photographs. */}
        <div className="min-w-0 lg:sticky lg:top-24">
          <div className="plinth relative aspect-[5/4] w-full overflow-hidden rounded-[2rem]">
            <AnimatePresence mode="wait">
              <motion.div
                key={images[shown] ?? "plate"}
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease }}
                className="absolute inset-0"
              >
                {images[shown] ? (
                  <Photograph path={images[shown]} alt={`${item.brand} ${item.model}`} inset="inset-[5%]" />
                ) : (
                  <Plate brand={item.brand} model={item.model} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.slice(0, 8).map((path, i) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setShown(i)}
                  aria-label={`Photograph ${i + 1}`}
                  className={cn(
                    "relative size-16 shrink-0 overflow-hidden rounded-xl bg-[#ece7df] transition-[box-shadow,opacity]",
                    i === shown
                      ? "shadow-[0_0_0_2px_var(--color-canvas),0_0_0_3.5px_rgb(255_236_222/0.8)]"
                      : "opacity-70 hover:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/iem-images/${path}`}
                    alt=""
                    className="size-full object-contain p-1.5 mix-blend-multiply"
                  />
                </button>
              ))}
            </div>
          )}
          {item.image && <p className="mt-3 text-[11px] text-ink-faint">Photograph: {item.image.credit}</p>}
        </div>

        {/* What it is, and where to get it. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease }}
          className="min-w-0"
        >
          <p className="eyebrow eyebrow-rule">{KIND[item.kind]}</p>
          <p className="mt-6 text-[13px] tracking-[0.3em] text-ink-muted uppercase">{item.brand}</p>
          <h1 className="marquee mt-2 text-[clamp(2.6rem,5.6vw,5rem)] leading-[0.95]">
            <em className="voice text-sunset">{item.model}</em>
          </h1>

          {item.score ? (
            <div className="mt-8 flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="numeric text-[clamp(3rem,6vw,4.2rem)] leading-none text-ink">
                {item.score.mean.toFixed(0)}
              </p>
              <div className="pb-1.5 text-[13px] leading-snug text-ink-muted">
                <p className="text-ink">for your sound</p>
                <p>
                  {item.score.low.toFixed(0)}–{item.score.high.toFixed(0)} range · #{item.score.rank} of all
                  you could be matched with
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-8 max-w-md text-[13px] leading-relaxed text-ink-faint">
              {!item.measured
                ? "Nobody has published a measurement of it that AURALS could find yet, so it can't be scored. It is listed so you can still find where to buy it."
                : item.kind === "headphones"
                  ? "Headphones are measured on a different kind of rig, and AURALS matches in-ears for now, so this has no score for you yet."
                  : item.comparable
                    ? "Find your sound and this shows how it fits you."
                    : "Measured on a rig AURALS can't yet compare with its target, so it isn't scored."}
            </p>
          )}

          {/* Hear it: the measured tuning, on the listener's own music. */}
          {item.comparable && (
            <section className="mt-10 overflow-hidden rounded-[1.4rem] bg-[radial-gradient(120%_140%_at_0%_0%,rgb(255_138_98/0.16),transparent_55%),rgb(255_255_255/0.025)] p-5 shadow-[inset_0_0_0_1px_rgb(255_236_222/0.09)] sm:p-6">
              <p className="text-[11px] tracking-[0.24em] text-ink-faint uppercase">Hear it</p>
              <p className="display mt-2 text-[1.55rem] leading-tight text-ink">
                Your music, through the <em className="voice text-sunset">{item.model}</em>.
              </p>
              <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-ink-muted">
                Its measured tuning applied to a song you choose, level-matched, with a switch to hear the
                song as it is. A frequency response — not the fit, the seal or the earphone itself.
              </p>
              <ListenButton
                slug={item.slug}
                label={`${item.brand} ${item.model}`}
                variant="solid"
                className="mt-5"
              />
            </section>
          )}

          {/* Where to buy. */}
          <section className="mt-10">
            <h2 className="text-[11px] tracking-[0.24em] text-ink-faint uppercase">Where to buy in India</h2>
            {india.length ? (
              <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
                {india.map((o, i) => (
                  <motion.li
                    key={`${o.retailer}-${o.url}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.08 * i, ease }}
                  >
                    <a
                      href={o.url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="group flex items-center gap-4 py-4"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] text-ink">{o.retailer}</span>
                        <span className="block text-[11.5px] text-ink-faint">
                          Seen{" "}
                          {new Date(o.observed_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </span>
                      <span className={cn("numeric text-[1.35rem]", i === 0 ? "text-sunset" : "text-ink")}>
                        {formatMoney(Number(o.amount), o.currency)}
                      </span>
                      <span className="grid size-9 place-items-center rounded-full text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] transition-[background-color,color,transform] duration-500 group-hover:rotate-45 group-hover:bg-white/[0.06] group-hover:text-ink">
                        <ArrowUpRight className="size-4" />
                      </span>
                    </a>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                No Indian listing has been found for it yet. AURALS is still gathering them.
              </p>
            )}
            {elsewhere.length > 0 && (
              <p className="mt-3 text-[12px] text-ink-faint">
                Also listed abroad:{" "}
                {elsewhere.map((o, i) => (
                  <span key={`${o.retailer}-${i}`}>
                    {i > 0 && ", "}
                    <a
                      href={o.url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline decoration-white/20 underline-offset-2 hover:text-ink"
                    >
                      {o.retailer} {formatMoney(Number(o.amount), o.currency)}
                    </a>
                  </span>
                ))}
                .
              </p>
            )}
          </section>

          {/* How it measures. */}
          {curve && (
            <section className="mt-12">
              <h2 className="text-[11px] tracking-[0.24em] text-ink-faint uppercase">How it measures</h2>
              <div className="mt-4 rounded-2xl bg-white/[0.02] p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <FrChart
                  freqs={curve.freqs_hz}
                  measured={curve.db}
                  target={curve.target_db}
                  personal={curve.personal_db}
                />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-faint">
                <span>
                  <span className="mr-1.5 inline-block h-0.5 w-4 bg-linear-to-r from-ember to-[#b9a6ff] align-middle" />
                  {item.model}
                </span>
                <span>
                  <span className="mr-1.5 inline-block w-4 border-t border-dashed border-white/40 align-middle" />
                  Reference target
                </span>
                {curve.personal_db && (
                  <span>
                    <span className="mr-1.5 inline-block h-0.5 w-4 bg-[#f1d39b]/60 align-middle" />
                    Your target
                  </span>
                )}
              </p>
            </section>
          )}

          {recommendation && (
            <section className="mt-12">
              <h2 className="text-[11px] tracking-[0.24em] text-ink-faint uppercase">
                Why it scores that for you
              </h2>
              <ul className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-ink-muted">
                {recommendation.reasons
                  .filter((r) => r.kind !== "note" || r.status === "derived")
                  .slice(0, 5)
                  .map((r) => (
                    <li key={r.message} className="flex gap-3">
                      <span
                        className={cn(
                          "mt-2 size-1.5 shrink-0 rounded-full",
                          r.kind === "mismatch"
                            ? "bg-flamingo"
                            : r.kind === "match"
                              ? "bg-sun"
                              : "bg-white/30",
                        )}
                      />
                      {r.message}
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="mt-12 border-t border-hairline pt-6 text-[12px] leading-relaxed text-ink-faint">
            <p>
              {data.measurements.length ? "Measured by " : "Not measured yet."}
              {[
                ...new Set(
                  data.measurements.map(
                    (m) =>
                      `${m.source}${m.rig && !m.rig.startsWith("not stated") ? ` on a ${m.rig}` : " (rig not stated)"}`,
                  ),
                ),
              ].join("; ")}
              {data.measurements.length ? "." : ""}
              {item.converted &&
                " Compared with the target after a measured conversion from a clone coupler, so its range is wider."}
            </p>
            <p className="mt-2">
              Prices are as listed by each shop when AURALS looked, and may have changed since.
            </p>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
