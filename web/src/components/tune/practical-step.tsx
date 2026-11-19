"use client";

import type { Profile } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  BUDGET_BANDS,
  budgetStops,
  CURRENCIES,
  DEFAULT_CURRENCY,
  detectRegion,
  formatMoney,
  formatShort,
} from "@/lib/currency";
import * as Slider from "@radix-ui/react-slider";
import { Headphones, Sparkles, Sprout, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type KeyboardEvent } from "react";

export type Practical = {
  currency: string;
  country_code: string | null;
  budget: [number, number] | null; // indexes into budgetStops
  experience: Profile["experience"];
  gear: string[];
};

export function initialPractical(profile: Profile | undefined, gearHint?: string | null): Practical {
  const region = typeof navigator === "undefined" ? null : detectRegion();
  // Rupees first, unless the listener has already chosen otherwise.
  const currency = profile?.currency ?? DEFAULT_CURRENCY;
  const stops = budgetStops(currency);
  const indexOf = (amount: number | null | undefined, fallback: number) => {
    if (amount == null) return fallback;
    let best = 0;
    stops.forEach((s, i) => {
      if (Math.abs(s - amount) < Math.abs(stops[best] - amount)) best = i;
    });
    return best;
  };
  const gear = profile?.current_gear ?? [];
  return {
    currency,
    country_code: profile?.country_code ?? region,
    budget:
      profile?.budget_min != null || profile?.budget_max != null
        ? [indexOf(profile?.budget_min, 0), indexOf(profile?.budget_max, stops.length - 1)]
        : null,
    experience: profile?.experience ?? null,
    // What they told the listening session they wear, if they have not listed anything yet.
    gear: gear.length ? gear : gearHint ? [gearHint] : [],
  };
}

const EXPERIENCE = [
  { value: "new", label: "New to IEMs", hint: "Mostly earbuds or headphones so far", icon: Sprout },
  { value: "casual", label: "Owned a few", hint: "I know what I like, roughly", icon: Headphones },
  { value: "enthusiast", label: "Enthusiast", hint: "I read graphs and compare tunings", icon: Sparkles },
] as const;

/** The currencies offered as one tap; the rest are in the list beside them. */
const QUICK = ["INR", "USD", "EUR", "GBP"] as const;

function Section({
  index,
  title,
  note,
  children,
}: {
  index: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t border-hairline pt-7">
      <span className="numeric pt-1 text-[11px] text-ink-faint">{index}</span>
      <div className="min-w-0">
        <h3 className="text-[16px] text-ink">{title}</h3>
        {note && <p className="mt-1 text-[13px] leading-relaxed text-ink-faint">{note}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

export function PracticalStep({ value, onChange }: { value: Practical; onChange: (v: Practical) => void }) {
  const stops = budgetStops(value.currency);
  const range = value.budget ?? [4, 6];
  const [gearDraft, setGearDraft] = useState("");
  const high = range[1] === stops.length - 1;
  const money = (i: number, open = false) => formatMoney(stops[i], value.currency, open);

  const addGear = () => {
    const item = gearDraft.trim().slice(0, 80);
    if (item && !value.gear.includes(item) && value.gear.length < 10) {
      onChange({ ...value, gear: [...value.gear, item] });
    }
    setGearDraft("");
  };
  const onGearKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addGear();
    } else if (event.key === "Backspace" && !gearDraft && value.gear.length) {
      onChange({ ...value, gear: value.gear.slice(0, -1) });
    }
  };
  const setCurrency = (currency: string) => onChange({ ...value, currency, budget: null });

  return (
    <div className="flex flex-col gap-10">
      <Section
        index="01"
        title="Budget for your next IEM"
        note="Only ever used to filter what is shown. Prices are in rupees unless you shop in another currency."
      >
        {/* Currency: rupees first, the usual others one tap away. */}
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Currency">
          {QUICK.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value.currency === c}
              onClick={() => setCurrency(c)}
              className={cn(
                "numeric rounded-full px-3 py-1.5 text-[12px] transition-[background-color,box-shadow,color] duration-300",
                value.currency === c
                  ? "bg-white/[0.1] text-ink shadow-[inset_0_0_0_1px_rgb(255_236_222/0.45)]"
                  : "text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] hover:text-ink",
              )}
            >
              {formatShort(0, c).replace("0", "")} {c}
            </button>
          ))}
          <select
            value={QUICK.includes(value.currency as (typeof QUICK)[number]) ? "" : value.currency}
            onChange={(e) => e.target.value && setCurrency(e.target.value)}
            aria-label="Other currency"
            className="numeric rounded-full bg-transparent px-3 py-1.5 text-[12px] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] outline-none hover:text-ink"
          >
            <option value="">More…</option>
            {CURRENCIES.filter((c) => !QUICK.includes(c as (typeof QUICK)[number])).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* The range, large, in the reader's own money. */}
        <div className="mt-7 min-h-[3.5rem]" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={value.budget ? `${value.currency}-${range[0]}-${range[1]}` : "none"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="marquee text-[clamp(2.2rem,4.4vw,3.4rem)] leading-none"
            >
              {value.budget ? (
                range[0] === 0 ? (
                  <>
                    Up to <em className="voice text-sunset">{money(range[1], high)}</em>
                  </>
                ) : (
                  <>
                    {money(range[0])} <span className="text-ink-faint">to</span>{" "}
                    <em className="voice text-sunset">{money(range[1], high)}</em>
                  </>
                )
              ) : (
                <span className="text-ink-faint">Pick a range</span>
              )}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Quick bands, then the fine control. */}
        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Price bands">
          {BUDGET_BANDS.map(([lo, hi]) => {
            const active = value.budget?.[0] === lo && value.budget?.[1] === hi;
            const label =
              lo === 0
                ? `Under ${formatShort(stops[hi], value.currency)}`
                : hi === stops.length - 1
                  ? `${formatShort(stops[lo], value.currency)}+`
                  : `${formatShort(stops[lo], value.currency)}–${formatShort(stops[hi], value.currency).replace(/^[^\d]+/, "")}`;
            return (
              <button
                key={`${lo}-${hi}`}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...value, budget: [lo, hi] })}
                className={cn(
                  "numeric rounded-full px-3.5 py-2 text-[13px] transition-[background-color,box-shadow,color,transform] duration-300 active:scale-[0.97]",
                  active
                    ? "bg-linear-to-r from-sun/25 to-flamingo/25 text-ink shadow-[inset_0_0_0_1px_rgb(255_206_168/0.55)]"
                    : "text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] hover:text-ink hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.22)]",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Slider.Root
          className="relative mt-8 flex h-6 touch-none items-center select-none"
          min={0}
          max={stops.length - 1}
          step={1}
          minStepsBetweenThumbs={1}
          value={range}
          onValueChange={(v) => onChange({ ...value, budget: [v[0], v[1]] })}
        >
          <Slider.Track className="relative h-1 grow rounded-full bg-white/10">
            <Slider.Range
              className={cn(
                "absolute h-full rounded-full",
                value.budget ? "bg-linear-to-r from-sun to-flamingo" : "bg-white/20",
              )}
            />
          </Slider.Track>
          {["Minimum budget", "Maximum budget"].map((label) => (
            <Slider.Thumb
              key={label}
              aria-label={label}
              className="block size-5 rounded-full border-2 border-canvas bg-ink shadow-[0_0_0_1px_rgb(255_255_255/0.3),0_4px_14px_rgb(0_0_0/0.6)] transition-transform hover:scale-110"
            />
          ))}
        </Slider.Root>
        <div className="numeric mt-2 flex justify-between text-[10.5px] text-ink-faint" aria-hidden="true">
          <span>{formatShort(stops[0], value.currency)}</span>
          <span>{formatShort(stops[Math.floor(stops.length / 2)], value.currency)}</span>
          <span>{formatShort(stops[stops.length - 1], value.currency)}+</span>
        </div>
      </Section>

      <Section index="02" title="How familiar are you with IEMs?">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Experience">
          {EXPERIENCE.map((option) => {
            const checked = value.experience === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onChange({ ...value, experience: option.value })}
                className={cn(
                  "group rounded-2xl p-4 text-left transition-[background-color,box-shadow] duration-300",
                  checked
                    ? "bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_236_222/0.45)]"
                    : "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 transition-colors",
                    checked ? "text-sun" : "text-ink-faint group-hover:text-ink-muted",
                  )}
                />
                <span className="mt-3 block text-[14px] text-ink">{option.label}</span>
                <span className="mt-1 block text-[12px] leading-snug text-ink-faint">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section index="03" title="What do you listen with today?" note="Optional. Press Enter after each one.">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.02] p-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)] focus-within:shadow-[inset_0_0_0_1px_rgb(255_236_222/0.4)]">
          {value.gear.map((item) => (
            <span
              key={item}
              className="flex items-center gap-1.5 rounded-full bg-elevated py-1 pr-1.5 pl-3 text-[13px] text-ink"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange({ ...value, gear: value.gear.filter((g) => g !== item) })}
                className="grid size-5 grid-cols-1 place-items-center rounded-full text-ink-faint hover:bg-white/10 hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={gearDraft}
            onChange={(e) => setGearDraft(e.target.value)}
            onKeyDown={onGearKey}
            onBlur={addGear}
            maxLength={80}
            placeholder={value.gear.length ? "" : "e.g. AirPods Pro, boAt Airdopes, Moondrop Chu II"}
            className="min-w-40 flex-1 bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none placeholder:text-ink-faint"
            aria-label="Current audio gear"
          />
        </div>
      </Section>
    </div>
  );
}
