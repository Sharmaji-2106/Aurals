"use client";

import { ListenButton } from "@/components/listen/listening";
import { Photograph } from "@/components/results/product-art";
import type { StoreItem } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import { motion } from "motion/react";
import Link from "next/link";

/**
 * A product in the store: its photograph on a backdrop in its own colours (or,
 * without one, its name set as a plate and said to be no photograph), its best
 * listing in India, and — for a listener with a sound profile — how it fits them.
 */

export function StoreArt({
  item,
  className,
}: {
  item: Pick<StoreItem, "image" | "brand" | "model">;
  className?: string;
}) {
  if (item.image) {
    return (
      <Photograph
        path={item.image.path}
        alt={`${item.brand} ${item.model}`}
        inset="inset-[6%]"
        className={className}
      />
    );
  }
  return <Plate brand={item.brand} model={item.model} className={className} />;
}

/** The name, set like a book plate: never a stand-in picture of the product. */
export function Plate({ brand, model, className }: { brand: string; model: string; className?: string }) {
  return (
    <div className={cn("absolute inset-0", className)}>
      <div className="absolute inset-[6%] flex flex-col justify-between overflow-hidden rounded-[1.35rem] bg-[radial-gradient(130%_100%_at_20%_0%,#2a2233,#141119_70%)] p-[9%] shadow-[inset_0_0_0_1px_rgb(255_236_222/0.08)]">
        <span className="text-[10px] tracking-[0.3em] text-ink-faint uppercase">{brand}</span>
        <span className="display line-clamp-3 text-[clamp(1.4rem,2.4vw,2.1rem)] leading-[0.95] text-ink/85">
          {model}
        </span>
        <span className="text-[10px] text-ink-faint">No photograph yet</span>
      </div>
    </div>
  );
}

export function priceLine(item: Pick<StoreItem, "price" | "offers">) {
  const p = item.price;
  if (!p) return null;
  const money = formatMoney(Number(p.amount), p.currency);
  return {
    money,
    where: p.retailer,
    more: item.offers > 1 ? item.offers - 1 : 0,
    india: p.currency === "INR",
  };
}

const KIND: Record<StoreItem["kind"], string> = {
  "in-ear": "In-ear",
  earbuds: "Earbuds",
  headphones: "Headphones",
};

export function ProductCard({ item, index }: { item: StoreItem; index: number }) {
  const price = priceLine(item);
  return (
    <motion.li
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.7, delay: (index % 4) * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="group/card relative min-w-0"
    >
      <Link
        href={`/store/${item.slug}`}
        className="group block rounded-[1.6rem] focus-visible:outline-offset-4"
        data-store-item={item.slug}
      >
        <div className="plinth relative aspect-[4/5] w-full overflow-hidden rounded-[1.6rem] transition-transform duration-700 ease-(--ease-out-expo) group-hover:-translate-y-1">
          <StoreArt item={item} />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] tracking-[0.16em] text-white/80 uppercase backdrop-blur-sm">
              {item.measured ? KIND[item.kind] : "Not measured yet"}
            </span>
            {item.score && (
              <span
                className="rounded-full bg-linear-to-r from-sun to-flamingo px-2.5 py-0.5 text-[11px] font-medium text-[#1b1220] shadow-[0_6px_18px_-6px_rgb(255_138_98/0.7)]"
                title={`Expected rating for your sound, ${item.score.low.toFixed(0)}–${item.score.high.toFixed(0)}`}
              >
                {item.score.mean.toFixed(0)} for you
              </span>
            )}
          </div>
        </div>
        <div className="mt-3.5 px-1">
          <p className="text-[10.5px] tracking-[0.24em] text-ink-faint uppercase">{item.brand}</p>
          <p className="display group-hover:text-sunset mt-1 line-clamp-2 text-[1.3rem] leading-[1.05] text-ink transition-colors">
            {item.model}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[12.5px]">
            {price ? (
              <>
                <span className="numeric text-ink">{price.money}</span>
                <span className="text-ink-faint">
                  · {price.where}
                  {price.more ? ` +${price.more}` : ""}
                </span>
              </>
            ) : (
              <span className="text-ink-faint">Not listed in India yet</span>
            )}
          </p>
        </div>
      </Link>
      {/* Outside the link, over the photograph: a button can't live inside one. */}
      {item.comparable && (
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/5]">
          <ListenButton
            slug={item.slug}
            label={`${item.brand} ${item.model}`}
            className="pointer-events-auto absolute right-3.5 bottom-3.5 translate-y-1 opacity-0 transition-[opacity,transform] duration-500 group-hover/card:translate-y-0 group-hover/card:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 data-[live=true]:translate-y-0 data-[live=true]:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"
          />
        </div>
      )}
    </motion.li>
  );
}
