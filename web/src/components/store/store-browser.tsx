"use client";

import { ProductCard } from "@/components/store/product-card";
import { Lines } from "@/components/site/reveal";
import { api, unwrap } from "@/lib/api/client";
import type { StorePage, StoreQuery } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { BUDGET_BANDS, budgetStops, formatShort } from "@/lib/currency";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Camera, Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

const PAGE = 48;
const INR = budgetStops("INR");
const KINDS: { value: StoreQuery["kind"] | undefined; label: string }[] = [
  { value: undefined, label: "Everything" },
  { value: "in-ear", label: "In-ear" },
  { value: "headphones", label: "Headphones" },
];

function useDebounced<T>(value: T, ms: number) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setOut(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return out;
}

/**
 * The store's floor: every measured earphone and headphone, filtered and sorted,
 * loaded a page at a time as the listener scrolls.
 */
export function StoreBrowser() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<StoreQuery["kind"]>();
  const [band, setBand] = useState<number | null>(null);
  const [brand, setBrand] = useState<string>("");
  const [withPhoto, setWithPhoto] = useState(false);
  const [sort, setSort] = useState<StoreQuery["sort"] | null>(null);
  const search = useDebounced(q, 250);

  const query = useMemo<StoreQuery>(() => {
    const [lo, hi] = band !== null ? BUDGET_BANDS[band] : [null, null];
    return {
      q: search || undefined,
      kind,
      brand: brand || undefined,
      min_inr: lo !== null && lo > 0 ? INR[lo] : undefined,
      max_inr: hi !== null && hi < INR.length - 1 ? INR[hi] : undefined,
      with_photo: withPhoto || undefined,
      sort: sort ?? undefined,
    };
  }, [search, kind, brand, band, withPhoto, sort]);

  const pages = useInfiniteQuery({
    queryKey: ["store", "browse", query],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/store/products", { params: { query: { ...query, offset: pageParam, limit: PAGE } } }),
      ),
    initialPageParam: 0,
    getNextPageParam: (last: StorePage, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const first = pages.data?.pages[0];
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const scored = first?.scored ?? false;
  // A listener with a sound profile sees the store ordered for them unless they choose otherwise.
  const effectiveSort = sort ?? (scored ? "match" : "featured");

  // More as the end comes into view.
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && hasNextPage && !isFetchingNextPage && void fetchNextPage(),
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filtered = Boolean(search || kind || brand || band !== null || withPhoto);
  const reset = () => {
    setQ("");
    setKind(undefined);
    setBrand("");
    setBand(null);
    setWithPhoto(false);
  };

  return (
    <div>
      {/* The front of the shop. */}
      <section className="relative pt-12 sm:pt-20">
        <p className="eyebrow eyebrow-rule">The store</p>
        <h1 className="marquee mt-6 text-[clamp(3rem,8vw,7.5rem)]">
          <Lines stagger={0.1}>
            <>Every pair we&rsquo;ve</>
            <>
              <em className="voice text-sunset">measured</em>.
            </>
          </Lines>
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="lede mt-6 max-w-2xl"
        >
          {first ? (
            <>
              <span className="numeric text-ink">
                {first.kinds.reduce((n, k) => n + k.count, 0).toLocaleString("en-IN")}
              </span>{" "}
              earphones and headphones, each with its measured sound and where to buy it in India, in rupees.{" "}
              {scored
                ? "Ordered for your sound: every in-ear shows how it scores for you."
                : "Find your sound first, and every in-ear here shows how it fits you."}
            </>
          ) : (
            "Every earphone and headphone AURALS has measured, with where to buy it in India."
          )}
        </motion.p>
      </section>

      {/* The counter: search and filters, held at the top while browsing. */}
      <div className="relative z-30 -mx-4 mt-10 px-4 py-3 sm:-mx-8 sm:px-8 lg:sticky lg:top-16">
        <div className="glass flex flex-col gap-3 rounded-[1.4rem] p-3 sm:p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 basis-60 items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)] focus-within:shadow-[inset_0_0_0_1px_rgb(255_236_222/0.4)]">
              <Search className="size-4 shrink-0 text-ink-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search — Moondrop Chu, Sony WH-1000XM5, Truthear…"
                aria-label="Search the store"
                className="w-full min-w-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Clear search"
                  className="text-ink-faint hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              )}
            </label>
            <div
              className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]"
              role="tablist"
              aria-label="Kind"
            >
              {KINDS.map((k) => {
                const active = kind === k.value;
                const count = k.value ? first?.kinds.find((f) => f.name === k.value)?.count : undefined;
                return (
                  <button
                    key={k.label}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setKind(k.value)}
                    className={cn(
                      "relative rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                      active ? "text-ink" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="store-kind"
                        className="absolute inset-0 rounded-lg bg-white/[0.09]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative">
                      {k.label}
                      {count !== undefined && (
                        <span className="numeric ml-1.5 text-[11px] text-ink-faint">{count}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <select
              value={effectiveSort}
              onChange={(e) => setSort(e.target.value as StoreQuery["sort"])}
              aria-label="Sort"
              className="rounded-xl bg-white/[0.03] px-3 py-2 text-[13px] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] outline-none hover:text-ink"
            >
              {scored && <option value="match">Best for you</option>}
              <option value="featured">Featured</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="name">A–Z</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SlidersHorizontal className="mr-1 size-3.5 text-ink-faint" />
            {BUDGET_BANDS.map(([lo, hi], i) => {
              const active = band === i;
              const label =
                lo === 0
                  ? `Under ${formatShort(INR[hi], "INR")}`
                  : hi === INR.length - 1
                    ? `${formatShort(INR[lo], "INR")}+`
                    : `${formatShort(INR[lo], "INR")}–${formatShort(INR[hi], "INR").replace("₹", "")}`;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBand(active ? null : i)}
                  className={cn(
                    "numeric rounded-full px-3 py-1 text-[12px] transition-[background-color,box-shadow,color] duration-300",
                    active
                      ? "bg-linear-to-r from-sun/25 to-flamingo/25 text-ink shadow-[inset_0_0_0_1px_rgb(255_206_168/0.5)]"
                      : "text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] hover:text-ink",
                  )}
                >
                  {label}
                </button>
              );
            })}
            <span className="mx-1 h-4 w-px bg-white/10" />
            <button
              type="button"
              aria-pressed={withPhoto}
              onClick={() => setWithPhoto((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors",
                withPhoto
                  ? "bg-white/[0.09] text-ink shadow-[inset_0_0_0_1px_rgb(255_236_222/0.4)]"
                  : "text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] hover:text-ink",
              )}
            >
              <Camera className="size-3.5" /> With photo
            </button>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              aria-label="Brand"
              className="max-w-44 rounded-full bg-transparent px-3 py-1 text-[12px] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] outline-none hover:text-ink"
            >
              <option value="">All brands</option>
              {first?.brands.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.count})
                </option>
              ))}
            </select>
            <AnimatePresence>
              {filtered && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={reset}
                  className="ml-auto text-[12px] text-ink-faint underline-offset-4 hover:text-ink hover:underline"
                >
                  Clear filters
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* The floor. */}
      <div className="mt-8 flex items-baseline justify-between gap-4">
        <p className="text-[13px] text-ink-faint" aria-live="polite">
          {first
            ? `${first.total.toLocaleString("en-IN")} ${first.total === 1 ? "product" : "products"}`
            : "Loading the store…"}
          {band !== null && " with a rupee price in that range"}
        </p>
      </div>
      {pages.error ? (
        <p className="mt-10 text-[14px] text-ink-muted">
          The store couldn&rsquo;t be loaded: {pages.error.message}
        </p>
      ) : (
        <ul
          className={cn(
            "mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4",
            pages.isPlaceholderData && "opacity-60 transition-opacity",
          )}
        >
          {items.map((item, i) => (
            <ProductCard key={item.slug} item={item} index={i} />
          ))}
          {pages.isPending &&
            Array.from({ length: 8 }, (_, i) => (
              <li key={`s${i}`}>
                <div className="skeleton aspect-[4/5] w-full rounded-[1.6rem]" />
                <div className="skeleton mt-4 h-3 w-24 rounded" />
                <div className="skeleton mt-2 h-5 w-40 rounded" />
              </li>
            ))}
        </ul>
      )}
      {first && first.total === 0 && (
        <div className="mt-16 text-center">
          <p className="display text-[2rem] text-ink">Nothing matches that, yet.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 text-[13px] text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Clear the filters
          </button>
        </div>
      )}
      <div ref={end} className="h-px" />
      {isFetchingNextPage && <p className="mt-10 text-center text-[12px] text-ink-faint">More on the way…</p>}
    </div>
  );
}
