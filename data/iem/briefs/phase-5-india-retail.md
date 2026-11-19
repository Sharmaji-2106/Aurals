# Phase 5 — where to buy, in India, in rupees

**Owner decision, 2026-11-15:** every earphone and headphone AURALS can recommend
should link to where an Indian listener can buy it, with the rupee price listed
there. This is a development build, so licensing and terms are not a concern here,
but the facts must be real.

## Retailers

Look in all of these, and any other real Indian retailer you find:

- Headphone Zone (headphonezone.in)
- Amazon India (amazon.in)
- Flipkart (flipkart.com)
- ConceptKart (conceptkart.com)
- "The Audio Card" as the owner wrote it. Find which Indian audio store this is
  (possibly The Audio Store, theaudiostore.in, or a similarly named shop) and use it.
- HiFiNage (hifinage.com), Croma (croma.com), Reliance Digital, Vijay Sales, Ubuy
  India, and the Indian storefronts of brands that sell directly (for example
  Moondrop/Truthear/Tangzu through their Indian distributors, Sony/Sennheiser
  India stores).

## Order of work

1. The 203 ranked in-ears (`iems` with a measurement whose `rig_family` is
   `iec60318-4`).
2. In-ears measured on clone couplers (`iec60318-4-clone`). These are about to join
   the ranking.
3. Headphones, as Phase 4 adds them (`rig_family` starting with `headphone:`).
4. Everything else in the catalogue.

Work in bulk: retailer catalogue feeds and sitemaps (Shopify stores such as Headphone
Zone expose `/products.json` and `/sitemap.xml`), search pages, and product pages.
Match on brand plus model, then confirm on the product page.

## What each offer must be

- **The exact product.** The same model and generation, not a sibling, a bundle,
  "compatible with" accessories, ear tips or a cable for it. Different colours of
  the same model are fine. When a page sells several variants (with mic / without),
  record the base variant's price and say which variant it was.
- **A real product page URL** (https), not a search-results page. No affiliate tags.
- **The rupee price shown on that page** when you looked, and the date. Note if it
  was out of stock. Never estimate or convert a price. If no price is shown, keep
  the link and leave the price empty.
- Fetch politely: at most 1 request per second per host and a generic user agent.
  Do not log in, solve CAPTCHAs or bypass blocks. If Amazon or Flipkart block
  automated fetching, use what is publicly reachable (their own search result
  snippets, product page caches the site serves, or the brand's listing that links
  there). A link you could not confirm is reported as unconfirmed, not imported.

## Importing

Write each batch as a CSV for `auralis import-catalog` (see
`backend/src/auralis/iem/catalog.py` for columns), with `currency=INR`,
`price_region=IN`, `price_source=<retailer name>`, `price_source_url=<product page>`,
`price_observed_on=<date>`. Dry-run first, then import. A link without a price can
go in a separate `links-without-price.csv` for the owner. Keep everything under
`data/iem/market/india/`.

## Working alongside others

Two other Codex runs are active: Phase 3 (in-ear photographs) and Phase 4
(headphones). Do not touch their files (`data/iem/images/phase3/*`,
`data/iem/images/phase4/*`, their reports). **Do not edit anything under `web/` or
`backend/src/auralis/`.** Put scripts in `tools/iem-ingest/`. No schema migrations.
Storage rules as before: everything inside `G:\Auralis`, no deletions, back up before
overwriting, stop if G: drops below 5 GB free.

## Reporting

Append to `data/iem/reports/10-india-retail.md` after every batch, with counts per
retailer, products with at least one confirmed rupee price, and the products still
without an Indian listing.
