/**
 * Currency helpers for the budget step. No exchange rates: budgets stay in the
 * user's currency. Rupees come first: AURALS is built for listeners in India
 * first, so INR is the default and has price steps of its own.
 */

export const CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CNY",
  "KRW",
  "SGD",
  "CHF",
  "SEK",
] as const;
export type Currency = (typeof CURRENCIES)[number];

const REGION_CURRENCY: Record<string, Currency> = {
  US: "USD",
  GB: "GBP",
  IN: "INR",
  JP: "JPY",
  CA: "CAD",
  AU: "AUD",
  CN: "CNY",
  KR: "KRW",
  SG: "SGD",
  CH: "CHF",
  SE: "SEK",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  IE: "EUR",
  AT: "EUR",
  BE: "EUR",
  FI: "EUR",
  PT: "EUR",
  GR: "EUR",
};

// Rough order-of-magnitude scale so the slider stops feel natural in each currency.
const MAGNITUDE: Partial<Record<Currency, number>> = { INR: 80, JPY: 150, KRW: 1300, CNY: 7, SEK: 10 };
const BASE_STOPS = [0, 20, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000];

export function detectRegion(): string | null {
  try {
    const locale = new Intl.Locale(navigator.language);
    return locale.maximize().region ?? null;
  } catch {
    return null;
  }
}

export function currencyForRegion(region: string | null): Currency {
  return (region && REGION_CURRENCY[region]) || "INR";
}

/** The currency a new listener starts in: rupees, whatever the browser says. */
export const DEFAULT_CURRENCY: Currency = "INR";

/**
 * Rupee steps follow how earphones are actually priced in India, rather than
 * dollars scaled up: the jumps that matter at the low end are a thousand
 * rupees, not eighty.
 */
const INR_STOPS = [0, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000];

function niceRound(n: number) {
  if (n < 10) return n;
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

export function budgetStops(currency: string): number[] {
  if (currency === "INR") return INR_STOPS;
  const m = MAGNITUDE[currency as Currency] ?? 1;
  return BASE_STOPS.map((s) => niceRound(s * m));
}

export function formatMoney(amount: number, currency: string, open = false) {
  // Rupees are grouped the Indian way (₹1,00,000), wherever the reader is.
  const text = new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
  return open ? `${text}+` : text;
}

/** "₹5k" — the short form for chips. */
export function formatShort(amount: number, currency: string) {
  const symbol =
    new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency;
  if (amount >= 100000 && currency === "INR") return `${symbol}${+(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${symbol}${+(amount / 1000).toFixed(1)}k`;
  return `${symbol}${amount}`;
}

/** Price bands as pairs of stop indexes: the quick choices above the slider. */
export const BUDGET_BANDS: readonly (readonly [number, number])[] = [
  [0, 2],
  [2, 4],
  [4, 6],
  [6, 8],
  [8, 10],
  [10, 12],
];
