import type { PageElement, PageSpec } from "@/components/book/page-svg";
import { SAMPLE_RUN, type BookRun } from "@/components/book/run";
import { SAMPLE_LISTENER } from "@/components/book/sample-listener";

/**
 * The edition: what is printed in the book.
 *
 * Three things live here, and they are kept apart on purpose.
 *
 * 1. **The photographs**, with where each one came from. Every image is a real
 *    product photograph of the named earphone, downloaded from the
 *    manufacturer's own product page where the manufacturer publishes one,
 *    otherwise from an established retailer's listing. None is generated, none
 *    is of a similar-looking model, and none has had its shape altered — only
 *    cropped, resized and re-encoded (`design/book/prepare_product_images.py`).
 *    Permission for reuse has not been obtained for any of them; this is a
 *    development prototype and they are recorded as such.
 *
 * 2. **The selected product**, as a data model (`BookFeature`) rather than as a
 *    layout. The final page is built *from* it, which is the seam where a real
 *    recommendation replaces this demo one: give `editionPages` a different
 *    feature and the book prints a different last page, and the interface the
 *    page becomes says the same thing.
 *
 * 3. **The pages**, as layout. Coordinates are in a 1000 × 1250 page space
 *    (4:5, the page's real proportion), shared by the texture on the 3D leaf
 *    and the DOM page that replaces it.
 *
 * Every factual line printed under a photograph is taken from the source page
 * recorded beside that photograph. Editorial lines ("The art of listening")
 * are copy, not claims, and say nothing about any product.
 */

/* ------------------------------------------------------------ photographs --- */

export type BuiltinImageId =
  "nova-studio" | "nova-fabric" | "aether" | "sa6-mk2" | "supermix-4" | "blessing-3" | "performer-5-2";
/**
 * A photograph the book can print: one of its own, or a catalogue photograph of
 * a listener's match, registered when their edition is prepared
 * (`registerImage`).
 */
export type ImageId = BuiltinImageId | `catalogue/${string}`;

export type ProductImage = {
  id: ImageId;
  brand: string;
  model: string;
  /** The catalogue entry this is a photograph of, when the catalogue has one. */
  catalogueSlug: string | null;
  file: string;
  width: number;
  height: number;
  alt: string;
  source: {
    kind: "manufacturer" | "retailer" | "catalogue";
    name: string;
    /** The page the photograph was found on. */
    pageUrl: string;
    /** The image itself, as served when it was downloaded. */
    imageUrl: string;
    retrievedOn: string;
  };
  processing: string;
  licence: string;
};

const UNCONFIRMED =
  "Downloaded for a development prototype. Permission for reuse has not been obtained; treat as unconfirmed until it is.";

export const IMAGES: Record<ImageId, ProductImage> = {
  "nova-studio": {
    id: "nova-studio",
    brand: "Truthear",
    model: "Nova",
    catalogueSlug: "truthear-nova",
    file: "/book/products/nova-studio.jpg",
    width: 1000,
    height: 1000,
    alt: "A pair of Truthear Nova in-ear monitors with deep blue faceplates, photographed on white.",
    source: {
      kind: "manufacturer",
      name: "Truthear",
      pageUrl: "https://truthear.com/products/nova",
      imageUrl:
        "https://cdn.prod.website-files.com/63bcdfa5158ffcd72a7a8d8e/66457fd840bb2326343c0f1f_NOVA.jpg",
      retrievedOn: "2026-11-11",
    },
    processing: "None: 1000 px as published.",
    licence: UNCONFIRMED,
  },
  "nova-fabric": {
    id: "nova-fabric",
    brand: "Truthear",
    model: "Nova",
    catalogueSlug: "truthear-nova",
    file: "/book/products/nova-fabric.jpg",
    width: 800,
    height: 800,
    alt: "Truthear Nova earphones with their blue cable, resting on folds of blue fabric.",
    source: {
      kind: "manufacturer",
      name: "Truthear",
      pageUrl: "https://truthear.com/products/nova",
      imageUrl:
        "https://cdn.prod.website-files.com/63bcdfa5158ffcd72a7a8d8e/66457c9003b0e8618b98e1fd_800x800_0032_DSC00556.jpg",
      retrievedOn: "2026-11-11",
    },
    processing: "None: 800 px as published.",
    licence: UNCONFIRMED,
  },
  aether: {
    id: "aether",
    brand: "Kiwi Ears",
    model: "Aether",
    catalogueSlug: null,
    file: "/book/products/aether.jpg",
    width: 900,
    height: 1600,
    alt: "Two Kiwi Ears Aether earphones with silver-rimmed faceplates on a dark desk.",
    source: {
      kind: "manufacturer",
      name: "Kiwi Ears",
      pageUrl: "https://kiwiears.com/products/kiwi-ears-aether",
      imageUrl:
        "https://cdn.shopify.com/s/files/1/0582/0317/7110/files/Kiwi_Ears_Aether_2_8bf9a490-8ced-4802-8188-eec2d72a472b.jpg",
      retrievedOn: "2026-11-11",
    },
    processing: "Resized to 1600 px on the long edge.",
    licence: UNCONFIRMED,
  },
  "sa6-mk2": {
    id: "sa6-mk2",
    brand: "DUNU",
    model: "SA6 MK2",
    catalogueSlug: null,
    file: "/book/products/sa6-mk2.jpg",
    width: 1600,
    height: 1600,
    alt: "The stabilised-wood faceplates of a pair of DUNU SA6 MK2 earphones, on black.",
    source: {
      kind: "retailer",
      name: "Linsoul",
      pageUrl: "https://www.linsoul.com/products/dunu-sa6-mkii",
      imageUrl: "https://www.linsoul.com/cdn/shop/files/3_9c5ee333-2ae6-4a59-892a-dfe6695aec42.jpg",
      retrievedOn: "2026-11-11",
    },
    processing: "Resized to 1600 px.",
    licence: UNCONFIRMED,
  },
  "supermix-4": {
    id: "supermix-4",
    brand: "Simgot",
    model: "SuperMix 4",
    catalogueSlug: null,
    file: "/book/products/supermix-4.jpg",
    width: 1600,
    height: 1600,
    alt: "A pair of black Simgot SuperMix 4 earphones with copper ring details, photographed on white.",
    source: {
      kind: "retailer",
      name: "Linsoul",
      pageUrl: "https://www.linsoul.com/products/simgot-supermix-4",
      imageUrl: "https://www.linsoul.com/cdn/shop/files/IMG_5242.jpg",
      retrievedOn: "2026-11-11",
    },
    processing: "Resized to 1600 px.",
    licence: UNCONFIRMED,
  },
  "blessing-3": {
    id: "blessing-3",
    brand: "Moondrop",
    model: "Blessing 3",
    catalogueSlug: null,
    file: "/book/products/blessing-3.jpg",
    width: 791,
    height: 892,
    alt: "A Moondrop Blessing 3 earphone with a polished stainless steel faceplate, lit from above.",
    source: {
      kind: "manufacturer",
      name: "Moondrop",
      pageUrl: "https://moondroplab.com/en/products/blessing3",
      imageUrl:
        "https://cdn.prod.website-files.com/627128d862c9a44234848dda/643f42e82ef62c0058f2765e_Blessing-3_08.jpg",
      retrievedOn: "2026-11-11",
    },
    processing:
      "Cropped to the panel's lower, photographic part (rows 1100–1992), so none of its copy is reproduced.",
    licence: UNCONFIRMED,
  },
  "performer-5-2": {
    id: "performer-5-2",
    brand: "AFUL",
    model: "Performer 5+2",
    catalogueSlug: null,
    file: "/book/products/performer-5-2.jpg",
    width: 1000,
    height: 1000,
    alt: "AFUL Performer 5+2 earphones with teal faceplates and a braided cable, against dark blue.",
    source: {
      kind: "retailer",
      name: "HiFiGo",
      pageUrl: "https://hifigo.com/products/aful-performer-5-2-performer-7",
      imageUrl:
        "https://hifigo.com/cdn/shop/files/aful-performer-52-performer-7-iems-hifigo-performer-7-35mm-304635.jpg",
      retrievedOn: "2026-11-11",
    },
    processing: "None: 1000 px as served.",
    licence: UNCONFIRMED,
  },
};

/* ----------------------------------------------------- specifications --- */

/**
 * Adds a catalogue photograph to the book's photographs, so the pages, their
 * textures and the ending use it like any other. Called once per edition,
 * before its pages are made.
 */
export function registerImage(image: ProductImage) {
  IMAGES[image.id] = image;
}

/**
 * Published specifications, printed beside each photograph.
 *
 * Copied from the same page the photograph came from (`IMAGES[id].source`),
 * re-read on 2026-11-12, in the page's own figures. Only what that page states
 * is printed: Truthear does not state Nova's impedance, so none is printed;
 * Kiwi Ears gives the Aether two different sensitivities, so neither is; HiFiGo
 * lists one table for the Performer 5+2 and Performer 7 together, and the page
 * says so.
 */
export const SPECS: Partial<Record<ImageId, { rows: readonly [string, string][]; note?: string }>> = {
  aether: {
    rows: [
      ["Driver", "15.3 mm planar magnetic"],
      ["Impedance", "14 Ω"],
      ["Response", "20 Hz – 20 kHz"],
    ],
  },
  "sa6-mk2": {
    rows: [
      ["Drivers", "Six balanced armatures"],
      ["Impedance", "24 Ω @ 1 kHz"],
      ["Faceplate", "Stabilised wood"],
    ],
  },
  "supermix-4": {
    rows: [
      ["Impedance", "7.2 Ω ± 15%"],
      ["Sensitivity", "120 dB/Vrms"],
      ["Shell", "3D-printed resin"],
    ],
  },
  "blessing-3": {
    rows: [
      ["Impedance", "14.8 Ω ± 15%"],
      ["Sensitivity", "120 dB/Vrms"],
      ["Housing", "3D-printed medical resin"],
    ],
  },
  "performer-5-2": {
    rows: [
      ["Impedance", "15 Ω ± 20%"],
      ["Sensitivity", "109 dB @ 1 kHz"],
      ["Response", "10 Hz – 35 kHz"],
    ],
    note: "Listed by HiFiGo for Performer 5+2 and Performer 7 together.",
  },
};

/* --------------------------------------------------------------- the page --- */

export type BookFeature = {
  slug: string;
  brand: string;
  model: string;
  /** Editorial, two lines. Copy, not a claim about the product. */
  headline: readonly [string, string];
  /** Minimal product information, each line from `factsSource`. */
  facts: readonly { label: string; value: string }[];
  factsSource: { name: string; url: string; retrievedOn: string };
  /** Whose measurement the catalogue holds, if it holds one. */
  measurement: { by: string; rig: string } | null;
  /** What the engine said about it, for whom. */
  recommendation: {
    rank: number;
    of: number;
    mean: number;
    low: number;
    high: number;
    match: string;
    /** Who this was computed for, in words a reader understands. */
    listener: string;
  } | null;
  /** The product's photograph, or null when the catalogue has none. */
  plate: ImageId | null;
  /** The plate with its background removed (or the photograph itself), for the ending. */
  cutout: string;
  /** Where the product sits within the plate photograph, 0–1: the camera closes on it. */
  pair: { x: number; y: number; w: number; h: number };
  /** A studio shadow registered to the cutout, when one was made. */
  shadow: string | null;
  /** The paper colour under the plate: the product's own backdrop, or ivory. */
  plateGround: string;
  /** The price, as recorded, for the selection page; null when there is none. */
  price: { value: string; note: string } | null;
  /** A second photograph for the page before the selection, if there is one. */
  mood: ImageId | null;
  /**
   * Why the engine ranked it where it did, region by region, for whom it was
   * ranked: the engine's own figures, phrased for print.
   */
  fit: readonly string[];
  /** One sentence the maker publishes about it, quoted exactly, if any. */
  introduction: { quote: string; by: string } | null;
  /** What this page is. A demo must say it is one. */
  provenance: "demo" | "recommendation";
};

const INK_IVORY = "#F1E5D1";
const DEMO_RUN = SAMPLE_LISTENER;
const DEMO_NOVA = DEMO_RUN.recommendation;

/**
 * The prototype's selection: Truthear Nova, as the engine actually ranked it
 * for the sample listener.
 *
 * A real catalogue entry with a real measurement behind it (oratory1990, GRAS
 * 43AC, via AutoEq), ranked first of 203 for a real playlist, with its
 * manufacturer's own photography and specifications. It is **not** the
 * viewer's recommendation; the interface says so.
 */
export const DEMO_FEATURE: BookFeature = {
  slug: DEMO_NOVA.slug,
  brand: DEMO_NOVA.brand,
  model: DEMO_NOVA.model,
  headline: ["Written for the way", "you listen."],
  facts: [
    { label: "Configuration", value: "1 dynamic + 4 balanced armature" },
    { label: "Dynamic driver", value: "10 mm, LCP composite dome" },
    { label: "Shell", value: "DLP 3D-printed resin" },
    { label: "Connector", value: "0.78 mm 2-pin" },
    { label: "Sensitivity", value: "123 dB/Vrms @ 1 kHz" },
    { label: "Response", value: "20 Hz – 20 kHz (IEC 60318-4, −3 dB)" },
  ],
  factsSource: { name: "Truthear", url: "https://truthear.com/products/nova", retrievedOn: "2026-11-11" },
  measurement: { by: "oratory1990", rig: DEMO_NOVA.measurement.rig },
  recommendation: {
    rank: DEMO_NOVA.rank,
    of: DEMO_RUN.measured,
    mean: DEMO_NOVA.predicted_preference.mean,
    low: DEMO_NOVA.predicted_preference.low,
    high: DEMO_NOVA.predicted_preference.high,
    match: DEMO_NOVA.match,
    listener: `a sample listener (${DEMO_RUN.tracksAnalysed} tracks analysed)`,
  },
  plate: "nova-studio",
  cutout: "/book/products/nova-cutout.png",
  // From design/book/cutout.py (image-relative, 0–1).
  pair: { x: 0.065, y: 0.327, w: 0.865, h: 0.365 },
  shadow: "/book/products/nova-shadow.png",
  plateGround: INK_IVORY,
  price: null,
  mood: "nova-fabric",
  fit: DEMO_NOVA.reasons
    .filter((r) => r.kind === "match" && r.error_db !== null && r.tolerance_db !== null)
    .map((r) => {
      const names: Record<string, string> = {
        bass: "Bass",
        lower_mids: "Lower mids",
        vocals: "Vocals and presence",
        treble: "Treble",
        air: "Air",
      };
      const region = names[r.region ?? ""] ?? r.region;
      return `${region}: within ${r.error_db!.toFixed(1)} dB of the target, inside a ±${r.tolerance_db!.toFixed(1)} dB range.`;
    }),
  introduction: {
    quote: "NOVA is a 1DD+4BA in-ear headphone with 3-way crossover composite structure.",
    by: "Truthear",
  },
  provenance: "demo",
};

/* ------------------------------------------------------------------ pages --- */

export const PAGE = { w: 1000, h: 1250 } as const;

export const INK = {
  ivory: "#F1E5D1",
  navy: "#171D45",
  text: "#1A2049",
  muted: "#5D6079",
  gold: "#D5AD62",
  /** Foil gold reads too pale printed on ivory; the printed ink is deeper. */
  print: "#9E7838",
  charcoal: "#111116",
} as const;

/** The wordmark's ink as it prints on ivory: the foil's hues, deep enough to read. */
const WORDMARK_INK = ["#c46d80", "#c4846c", "#a8833f"] as const;

// Right pages keep the gutter on their left, left pages on their right.
const R = { x0: 148, x1: 906, mid: 527 };
const L = { x0: 94, x1: 852, mid: 473 };

type Text = Extract<PageElement, { kind: "text" }>;
type El = PageElement;

const t = (
  x: number,
  y: number,
  text: string,
  font: Text["font"],
  size: number,
  fill: string,
  extra: Partial<Text> = {},
): Text => ({
  kind: "text",
  x,
  y,
  text,
  font,
  size,
  fill,
  ...extra,
});

const label = (x: number, y: number, text: string, extra: Partial<Text> = {}): Text =>
  t(x, y, text, "sans", 13.5, INK.print, { weight: 500, tracking: 0.44, ...extra });

const lines = (
  x: number,
  y: number,
  step: number,
  rows: readonly string[],
  font: Text["font"],
  size: number,
  fill: string,
  extra: Partial<Text> = {},
) => rows.map((row, i) => t(x, y + i * step, row, font, size, fill, extra));

const body = (x: number, y: number, rows: readonly string[]) =>
  lines(x, y, 44, rows, "serif", 30, INK.text, { opacity: 0.88 });
const note = (x: number, y: number, rows: readonly string[]) =>
  lines(x, y, 24, rows, "sans", 15, INK.muted, { weight: 400 });

const folio = (side: "left" | "right", n: number, light = false): El[] => [
  t(
    side === "left" ? L.x0 : R.x1,
    1168,
    String(n).padStart(2, "0"),
    "sans",
    15,
    light ? INK.ivory : INK.muted,
    {
      weight: 500,
      tracking: 0.18,
      anchor: side === "left" ? "start" : "end",
      opacity: light ? 0.72 : 1,
    },
  ),
  t(side === "left" ? L.x0 + 52 : R.x1 - 52, 1168, "AURALS", "sans", 11.5, light ? INK.ivory : INK.muted, {
    weight: 500,
    tracking: 0.42,
    anchor: side === "left" ? "start" : "end",
    opacity: light ? 0.5 : 0.7,
  }),
];

/** Brand over model, lower corner, on a photograph. */
const caption = (side: "left" | "right", brand: string, model: string, note?: string): El[] => {
  const x = side === "left" ? L.x0 : R.x0;
  return [
    { kind: "shade", y0: 800, y1: 1250, from: 0, to: 0.66, color: "#05060c" },
    t(x, 1020, brand.toUpperCase(), "sans", 13, INK.ivory, { weight: 500, tracking: 0.36, opacity: 0.74 }),
    t(x, 1084, model, "serif", 60, INK.ivory),
    ...(note ? [t(x, 1122, note, "sans", 15, INK.ivory, { weight: 400, opacity: 0.7 })] : []),
  ];
};

/** A photograph's published specifications, in the corner opposite its caption. */
const specBlock = (side: "left" | "right", id: ImageId, ink: string = INK.ivory): El[] => {
  const spec = SPECS[id];
  if (!spec) return [];
  const x = side === "left" ? L.x1 : R.x1;
  return [
    ...spec.rows.flatMap(([k, v], i): El[] => [
      t(x, 984 + i * 46, k.toUpperCase(), "sans", 10.5, ink, {
        anchor: "end",
        weight: 500,
        tracking: 0.3,
        opacity: 0.6,
      }),
      t(x, 1006 + i * 46, v, "sans", 16, ink, { anchor: "end", weight: 400, opacity: 0.9 }),
    ]),
    ...(spec.note
      ? [t(x, 1134, spec.note, "sans", 11.5, ink, { anchor: "end", weight: 400, opacity: 0.55 })]
      : []),
  ];
};

/** A line that has to fit its column: cut at a word, with an ellipsis. */
function shorten(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The model name is the page's headline: as large as its length allows. */
function modelSize(model: string) {
  // About 0.5 em per character in the serif, across the 760-unit column.
  return Math.max(84, Math.min(252, Math.floor(760 / (Math.max(3, model.length) * 0.5))));
}

const fmtHz = (hz: number) => (hz >= 1000 ? `${+(hz / 1000).toFixed(1)}k` : String(hz));
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;

export type Leaf = { front: PageSpec; back: PageSpec };
export type Edition = {
  leaves: Leaf[];
  selected: PageSpec;
  plate: PageSpec;
  /** Where the product sits in the plate's photograph (see `BookFeature.pair`). */
  pair: BookFeature["pair"];
};

export function editionPages(feature: BookFeature, run: BookRun = SAMPLE_RUN): Edition {
  const RUN = run;
  const NOVA = run.recommendation;
  // The listener's own book prints "your"; the studio's says whose sample it is.
  const own = run.who === "listener";
  /* ---- spread 0: the title ---- */
  const title: PageSpec = {
    id: "title",
    side: "right",
    ground: INK.ivory,
    label: "Aurals. Beyond What You Hear.",
    elements: [
      label(R.mid, 214, "VOLUME ONE", { anchor: "middle", size: 14, tracking: 0.46 }),
      t(R.mid, 640, "Aurals", "script", 196, INK.navy, { anchor: "middle", gradient: WORDMARK_INK }),
      t(R.mid, 752, "Beyond What You Hear.", "serif-italic", 44, INK.text, { anchor: "middle" }),
      t(R.mid, 1132, "A PERSONAL AUDIO DISCOVERY", "sans", 12.5, INK.muted, {
        anchor: "middle",
        weight: 500,
        tracking: 0.36,
      }),
    ],
  };

  /* ---- spread 1: listening ---- */
  const listening: PageSpec = {
    id: "listening",
    side: "left",
    ground: INK.ivory,
    label: "The art of listening.",
    elements: [
      label(L.x0, 170, "CHAPTER ONE"),
      t(L.x0 - 6, 470, "The art", "serif", 138, INK.navy),
      t(L.x0 - 6, 606, "of listening.", "serif-italic", 138, INK.navy),
      { kind: "rule", x: L.x0, y: 690, w: 72, weight: 1.6, fill: INK.print },
      ...body(L.x0, 778, [
        "Two people can hear the same song",
        "and remember different things.",
        "Aurals starts with the music you already",
        "love. Your answers only refine it.",
      ]),
      label(L.x0, 990, "WHAT IT LISTENS FOR", { size: 12, tracking: 0.36 }),
      ...note(L.x0, 1026, [
        "The balance of your library, band by band.",
        "How sure it can be of that balance.",
        "What your answers add that music cannot show.",
      ]),
      ...folio("left", 2),
    ],
  };
  const aether: PageSpec = {
    id: "aether",
    side: "right",
    ground: INK.charcoal,
    label: "Kiwi Ears Aether.",
    elements: [
      { kind: "image", image: "aether", x: 0, y: 0, w: 1000, h: 1250, fit: "cover", focus: [0.5, 0.58] },
      ...caption("right", "Kiwi Ears", "Aether", "One 15.3 mm planar driver"),
      ...specBlock("right", "aether"),
      ...folio("right", 3, true),
    ],
  };

  /* ---- spread 2: analysis ---- */
  const analysis: PageSpec = {
    id: "analysis",
    side: "left",
    ground: INK.ivory,
    label: "What your music says.",
    elements: [
      label(L.x0, 170, "CHAPTER TWO · ANALYSIS"),
      t(L.x0 - 6, 400, "What your", "serif", 112, INK.navy),
      t(L.x0 - 6, 512, "music says.", "serif-italic", 112, INK.navy),
      ...[
        ["Every track is measured once, then deleted.", "Only the numbers are kept."],
        ["Its long-term spectrum is read in nine bands,", "relative to the midrange, 500 Hz to 2 kHz."],
        ["Your library is set against a 30-track reference", "corpus, with an interval on every band."],
        ["Bands a codec has cut away are left out,", "not guessed."],
      ].flatMap((rows, i) => [
        t(L.x0, 640 + i * 118, String(i + 1).padStart(2, "0"), "sans", 13, INK.print, {
          weight: 500,
          tracking: 0.2,
        }),
        ...lines(L.x0 + 56, 640 + i * 118, 38, rows, "serif", 27, INK.text, { opacity: 0.88 }),
      ]),
      ...folio("left", 4),
    ],
  };

  // The chart: nine bands of the sample listener's library against the
  // reference corpus, with their bootstrap intervals. Real numbers.
  const zero = 760;
  const perDb = 34;
  const col = (R.x1 - R.x0) / RUN.bands.length;
  const chart: El[] = [
    ...[-2, 2, 4].map((db): El => ({
      kind: "rect",
      x: R.x0,
      y: zero - db * perDb - 0.4,
      w: R.x1 - R.x0,
      h: 0.8,
      fill: INK.muted,
      opacity: 0.22,
    })),
    { kind: "rule", x: R.x0, y: zero, w: R.x1 - R.x0, weight: 1.2, fill: INK.text, opacity: 0.6 },
    t(R.x1, zero - 4 * perDb - 6, "+4 dB", "sans", 11, INK.muted, { anchor: "end", weight: 400 }),
    ...RUN.bands.flatMap((band, i): El[] => {
      const cx = R.x0 + col * (i + 0.5);
      const top = zero - Math.max(0, band.db) * perDb;
      const h = Math.abs(band.db) * perDb;
      return [
        { kind: "rect", x: cx - 14, y: band.db >= 0 ? top : zero, w: 28, h, fill: INK.navy, opacity: 0.88 },
        {
          kind: "rect",
          x: cx - 1.2,
          y: zero - band.high * perDb,
          w: 2.4,
          h: (band.high - band.low) * perDb,
          fill: INK.print,
        },
        t(cx, Math.min(top, zero - band.high * perDb) - 12, signed(band.db), "sans", 12.5, INK.text, {
          anchor: "middle",
          weight: 500,
        }),
        t(
          cx,
          zero + 44,
          band.label.toUpperCase().replace("LOWER ", "LOW ").replace("UPPER ", "UP "),
          "sans",
          10,
          INK.muted,
          {
            anchor: "middle",
            weight: 500,
            tracking: 0.12,
          },
        ),
        t(cx, zero + 64, `${fmtHz(band.lowHz)}–${fmtHz(band.highHz)}`, "sans", 10, INK.muted, {
          anchor: "middle",
          weight: 400,
          opacity: 0.8,
        }),
      ];
    }),
  ];
  const bands: PageSpec = {
    id: "bands",
    side: "right",
    ground: INK.ivory,
    label: own ? "Your music, band by band." : "A sample listener's music, band by band.",
    elements: [
      label(R.x0, 170, own ? "YOUR MUSIC" : "A SAMPLE LISTENER"),
      t(
        R.x1,
        170,
        `${shorten((RUN.playlist ?? "Your library").toUpperCase(), 26)} · ${RUN.tracksAnalysed} TRACKS`,
        "sans",
        12,
        INK.muted,
        {
          anchor: "end",
          weight: 500,
          tracking: 0.3,
        },
      ),
      t(R.x0 - 4, 318, "Weight below,", "serif-italic", 72, INK.navy),
      t(R.x0 - 4, 392, "air above.", "serif-italic", 72, INK.navy),
      ...note(R.x0, 450, ["Each band against the reference corpus, in dB, with its interval."]),
      ...chart,
      ...note(R.x0, 1016, [
        own
          ? "Above the line, your music carries more energy in that band than"
          : "Above the line, this playlist carries more energy in that band than",
        "typical music does; below it, less. The thin gold line is the interval.",
        own
          ? `From the analysis of your music on ${RUN.capturedOn}.`
          : `From a real analysis on ${RUN.capturedOn}. A sample, not your music.`,
      ]),
      ...folio("right", 5),
    ],
  };

  /* ---- spread 3: sound DNA ---- */
  const tonal = RUN.dimensions.filter((d) => d.group === "tonal");
  const dna: PageSpec = {
    id: "dna",
    side: "left",
    ground: INK.ivory,
    label: "Sound DNA.",
    elements: [
      label(L.x0, 170, "THE PROFILE"),
      t(L.x0 - 6, 400, "Sound DNA.", "serif", 128, INK.navy),
      ...lines(
        L.x0,
        486,
        40,
        own
          ? ["You, as Aurals models you: each region", "against the Harman in-ear target."]
          : ["The same listener, as Aurals models them: each", "region against the Harman in-ear target."],
        "serif",
        28,
        INK.text,
        { opacity: 0.88 },
      ),
      ...tonal.flatMap((d, i): El[] => {
        const y = 630 + i * 72;
        const span = 260;
        const x0 = 560;
        const pos = x0 + span / 2 + (Math.max(-3, Math.min(3, d.db)) / 3) * (span / 2);
        return [
          t(L.x0, y, d.label, "serif", 32, INK.navy),
          t(L.x0, y + 26, d.description, "sans", 14, INK.muted, { weight: 400 }),
          { kind: "rect", x: x0, y: y - 10, w: span, h: 1.2, fill: INK.muted, opacity: 0.45 },
          { kind: "rect", x: x0 + span / 2 - 0.6, y: y - 18, w: 1.2, h: 17, fill: INK.muted, opacity: 0.45 },
          { kind: "rect", x: pos - 2.5, y: y - 21, w: 5, h: 22, fill: INK.print },
          t(L.x1, y, `${signed(d.db)} dB`, "sans", 17, INK.text, { anchor: "end", weight: 500 }),
        ];
      }),
      ...note(L.x0, 1080, [
        "Treble tolerance, detail, soundstage and naturalness cannot be read",
        "from music. Aurals asks about those instead.",
      ]),
      ...folio("left", 6),
    ],
  };
  const sa6: PageSpec = {
    id: "sa6",
    side: "right",
    ground: INK.charcoal,
    label: "DUNU SA6 MK2.",
    elements: [
      { kind: "image", image: "sa6-mk2", x: 0, y: 0, w: 1000, h: 1250, fit: "cover", focus: [0.5, 0.46] },
      ...caption("right", "DUNU", "SA6 MK2", "Dual woofer, two mids, dual tweeter"),
      ...specBlock("right", "sa6-mk2"),
      ...folio("right", 7, true),
    ],
  };

  /* ---- spread 4: the regions, and voices ---- */
  const regionsCopy: Record<string, string> = {
    sub_bass: "Felt as much as heard.",
    mid_bass: "Kick drum and bass guitar: punch, body.",
    lower_mids: "Warmth and weight; too much clouds.",
    mids: "The core of most instruments.",
    upper_mids: "Where voices come forward.",
    presence: "Clarity and edge; the ear is keenest here.",
    lower_treble: "Consonants, cymbal strikes, sibilance.",
    upper_treble: "Sparkle and fine detail.",
    air: "Openness at the very top.",
  };
  const regions: PageSpec = {
    id: "regions",
    side: "left",
    ground: INK.ivory,
    label: "Bass, mids, treble.",
    elements: [
      label(L.x0, 170, "THE REGIONS"),
      t(L.x0 - 6, 380, "Bass, mids,", "serif", 104, INK.navy),
      t(L.x0 - 6, 482, "treble.", "serif-italic", 104, INK.navy),
      ...RUN.bands.flatMap((band, i): El[] => {
        const y = 590 + i * 56;
        const khz = (v: number) => String(+(v / 1000).toFixed(1));
        const hz =
          band.highHz > 1000
            ? `${khz(band.lowHz)}–${khz(band.highHz)} kHz`
            : `${band.lowHz}–${band.highHz} Hz`;
        return [
          t(L.x0, y, hz, "sans", 12.5, INK.print, { weight: 500, tracking: 0.06 }),
          t(L.x0 + 150, y, band.label, "serif", 29, INK.navy),
          t(L.x0 + 372, y, regionsCopy[band.key] ?? "", "sans", 15, INK.muted, { weight: 400 }),
        ];
      }),
      ...note(L.x0, 1110, ["Band edges as Aurals measures them."]),
      ...folio("left", 8),
    ],
  };
  const found = NOVA.regions.find((r) => r.region === "vocals");
  const vocals =
    found && found.error_db !== null && found.tolerance_db !== null
      ? { error_db: found.error_db, tolerance_db: found.tolerance_db }
      : null;
  const voices: PageSpec = {
    id: "voices",
    side: "right",
    ground: INK.ivory,
    label: "Vocal presentation.",
    elements: [
      label(R.x0, 170, "VOICES"),
      t(R.x0 - 6, 400, "Vocal", "serif", 112, INK.navy),
      t(R.x0 - 6, 512, "presentation.", "serif-italic", 112, INK.navy),
      ...body(R.x0, 610, [
        "Voices live mostly between 1.2 and 5 kHz.",
        "A little more energy there and a singer",
        "steps forward; a little less, and they",
        "settle back into the mix.",
      ]),
      ...note(R.x0, 804, [
        "Sibilance, the hiss of s and t, sits just above, in the lower",
        "treble. An earphone can bring a voice forward and still",
        "keep it smooth; the two are tuned separately.",
      ]),
      ...(vocals
        ? [
            label(
              R.x0,
              900,
              `${own ? "YOUR MATCH" : "SAMPLE LISTENER"} · ${shorten(`${NOVA.brand} ${NOVA.model}`.toUpperCase(), 30)}`,
              {
                size: 12.5,
                tracking: 0.3,
              },
            ),
            t(R.x0, 970, `${vocals.error_db.toFixed(1)} dB`, "serif", 60, INK.navy),
            ...note(R.x0, 1008, [
              "from target across vocals and presence,",
              `inside a ±${vocals.tolerance_db.toFixed(1)} dB range.`,
            ]),
          ]
        : []),
      ...folio("right", 9),
    ],
  };

  /* ---- spread 5: detail, and space ---- */
  const detail: PageSpec = {
    id: "detail",
    side: "left",
    ground: INK.ivory,
    label: "Detail retrieval.",
    elements: [
      label(L.x0, 170, "RESOLUTION"),
      t(L.x0 - 6, 400, "Detail", "serif", 112, INK.navy),
      t(L.x0 - 6, 512, "retrieval.", "serif-italic", 112, INK.navy),
      ...body(L.x0, 640, [
        "What listeners call detail is mostly balance:",
        "enough energy in the upper mids and treble",
        "that quiet sounds are not masked, and little",
        "enough distortion that they stay clean.",
        "It is heard, not printed on a spec sheet.",
      ]),
      label(L.x0, 912, "WHAT IS OFTEN CALLED DETAIL", { size: 12, tracking: 0.36 }),
      ...[
        ["Balance", "quiet sounds not masked by louder ones."],
        ["Transients", "the start of a note kept clean and quick."],
        ["Low distortion", "nothing added that was not recorded."],
      ].flatMap(([head, rest], i): El[] => [
        t(L.x0, 960 + i * 40, head, "serif", 24, INK.navy),
        t(L.x0 + 200, 960 + i * 40, rest, "sans", 15, INK.muted, { weight: 400 }),
      ]),
      ...note(L.x0, 1104, ["Detail is a priority you tell Aurals; it is not read from music."]),
      ...folio("left", 10),
    ],
  };
  const space: PageSpec = {
    id: "space",
    side: "right",
    ground: INK.ivory,
    label: "Imaging and soundstage.",
    elements: [
      label(R.x0, 170, "SPACE"),
      t(R.x0 - 6, 390, "Imaging &", "serif", 104, INK.navy),
      t(R.x0 - 6, 492, "soundstage.", "serif-italic", 104, INK.navy),
      ...body(R.x0, 620, [
        "An in-ear monitor plays inside the ear canal,",
        "so it cannot set sound out in the room the",
        "way speakers do. What it can do is image",
        "cleanly: matched channels and an even",
        "response let each instrument hold its place.",
      ]),
      ...note(R.x0, 880, [
        "What helps: left and right drivers matched closely,",
        "a smooth upper midrange, and a recording that was",
        "made with space in it to begin with.",
      ]),
      ...note(R.x0, 1104, ["Soundstage, too, is a priority you set."]),
      ...folio("right", 11),
    ],
  };

  /* ---- spread 6: drivers ---- */
  const drivers: [string, string, string][] = [
    [
      "Dynamic",
      "A diaphragm moved by a voice coil in a magnetic",
      "field. The classic design, prized for bass.",
    ],
    [
      "Balanced armature",
      "A tiny armature between magnets drives a diaphragm.",
      "Compact and efficient; several can share a shell.",
    ],
    [
      "Planar magnetic",
      "A thin film carrying a conductor, driven across",
      "its whole surface between magnets.",
    ],
    [
      "Electrostatic",
      "A charged membrane between perforated plates; in",
      "an in-ear monitor, kept for the top octaves.",
    ],
    ["Piezoelectric", "A ceramic that flexes under voltage, used", "for the upper treble."],
  ];
  const shell: PageSpec = {
    id: "shell",
    side: "left",
    ground: INK.ivory,
    label: "Inside the shell: driver technologies.",
    elements: [
      label(L.x0, 170, "TECHNOLOGY"),
      t(L.x0 - 6, 360, "Inside", "serif", 104, INK.navy),
      t(L.x0 - 6, 462, "the shell.", "serif-italic", 104, INK.navy),
      ...drivers.flatMap(([name, a, b], i) => [
        t(L.x0, 560 + i * 100, name, "serif", 32, INK.navy),
        ...note(L.x0, 590 + i * 100, [a, b]),
      ]),
      ...note(L.x0, 1084, [
        "A hybrid joins several types in one shell, each given",
        "the range it suits, divided between them by a crossover.",
      ]),
      ...folio("left", 12),
    ],
  };
  const supermix: PageSpec = {
    id: "supermix",
    side: "right",
    ground: INK.ivory,
    label: "Simgot SuperMix 4.",
    elements: [
      {
        kind: "image",
        image: "supermix-4",
        x: 80,
        y: 150,
        w: 880,
        h: 800,
        fit: "contain",
        focus: [0.5, 0.5],
        blend: "multiply",
      },
      t(R.x0, 1004, "SIMGOT", "sans", 12.5, INK.muted, { weight: 500, tracking: 0.38 }),
      t(R.x0, 1064, "SuperMix 4", "serif", 58, INK.navy),
      ...note(R.x0, 1100, ["A dynamic, an armature, a planar and a piezo driver in each shell."]),
      ...specBlock("right", "supermix-4", INK.text).map((el) =>
        el.kind === "text" ? { ...el, y: el.y - 38 } : el,
      ),
      ...folio("right", 13),
    ],
  };

  /* ---- spread 7: two hybrids ---- */
  const blessing: PageSpec = {
    id: "blessing",
    side: "left",
    ground: INK.charcoal,
    label: "Moondrop Blessing 3.",
    elements: [
      { kind: "image", image: "blessing-3", x: 0, y: 0, w: 1000, h: 1250, fit: "cover", focus: [0.55, 0.4] },
      ...caption("left", "Moondrop", "Blessing 3", "2 dynamic + 4 balanced armature"),
      ...specBlock("left", "blessing-3"),
      ...folio("left", 14, true),
    ],
  };
  const performer: PageSpec = {
    id: "performer",
    side: "right",
    ground: INK.charcoal,
    label: "AFUL Performer 5+2.",
    elements: [
      {
        kind: "image",
        image: "performer-5-2",
        x: 0,
        y: 0,
        w: 1000,
        h: 1250,
        fit: "cover",
        focus: [0.62, 0.5],
      },
      ...caption("right", "AFUL", "Performer 5+2", "2 dynamic + 4 armature + 1 micro planar"),
      ...specBlock("right", "performer-5-2"),
      ...folio("right", 15, true),
    ],
  };

  /* ---- spread 8: the method, and a shortlist ---- */
  const steps: [string, string, string][] = [
    [
      "Your music becomes a profile",
      "Held with its uncertainty, relative to the",
      `${RUN.referenceTarget} target.`,
    ],
    ["Your answers refine it", "They narrow the profile; they never replace", "what your music shows."],
    [
      `${RUN.measured} measured earphones`,
      "Measured by oratory1990 and published through",
      "AutoEq, each compared on a matching rig.",
    ],
    [
      "Scored as a listener would rate them",
      "With the Olive et al. in-ear preference model,",
      "across 256 draws from your profile.",
    ],
    ["Ranked, with a range", "Every result explained from the regions", "that produced its score."],
  ];
  const method: PageSpec = {
    id: "method",
    side: "left",
    ground: INK.ivory,
    label: "How Aurals recommends.",
    elements: [
      label(L.x0, 170, "THE METHOD"),
      t(L.x0 - 6, 350, "How Aurals", "serif", 100, INK.navy),
      t(L.x0 - 6, 450, "recommends.", "serif-italic", 100, INK.navy),
      ...steps.flatMap(([head, a, b], i) => [
        t(L.x0, 560 + i * 108, String(i + 1).padStart(2, "0"), "sans", 13, INK.print, {
          weight: 500,
          tracking: 0.2,
        }),
        t(L.x0 + 56, 560 + i * 108, head, "serif", 30, INK.navy),
        ...note(L.x0 + 56, 588 + i * 108, [a, b]),
      ]),
      ...folio("left", 16),
    ],
  };
  const shortlist: PageSpec = {
    id: "shortlist",
    side: "right",
    ground: INK.ivory,
    label: own ? "Your shortlist." : "A sample listener's shortlist.",
    elements: [
      label(R.x0, 170, own ? "YOUR RESULTS" : "A SAMPLE LISTENER"),
      t(R.x0 - 4, 360, "The shortlist.", "serif-italic", 92, INK.navy),
      ...RUN.shortlist.flatMap((item, i): El[] => {
        const y = 510 + i * 100;
        return [
          t(R.x0, y, String(item.rank).padStart(2, "0"), "sans", 14, INK.print, {
            weight: 500,
            tracking: 0.12,
          }),
          t(R.x0 + 52, y - 30, item.brand.toUpperCase(), "sans", 12, INK.muted, {
            weight: 500,
            tracking: 0.3,
          }),
          t(R.x0 + 52, y, shorten(item.model, 24), "serif", 34, INK.navy),
          t(R.x1, y, String(Math.round(item.mean)), "serif", 44, INK.navy, { anchor: "end" }),
          t(R.x1, y + 24, `${Math.round(item.low)}–${Math.round(item.high)}`, "sans", 13, INK.muted, {
            anchor: "end",
            weight: 400,
          }),
        ];
      }),
      ...note(R.x0, 1030, [
        "Expected rating, 0–100, from the Olive et al. in-ear model.",
        own
          ? `Ranked for you from ${RUN.measured} measured earphones.`
          : "Captured from a real run. Not your results.",
      ]),
      ...folio("right", 17),
    ],
  };

  /* ---- spread 9: the turn toward the selection ---- */
  const beyond: PageSpec = {
    id: "beyond",
    side: "left",
    ground: INK.ivory,
    label: "Beyond what you hear.",
    elements: [
      label(L.x0, 170, "THE SELECTION"),
      t(L.x0 - 6, 560, "Beyond", "serif", 150, INK.navy),
      t(L.x0 - 6, 706, "what you hear.", "serif-italic", 120, INK.navy),
      { kind: "rule", x: L.x0, y: 790, w: 72, weight: 1.6, fill: INK.print },
      ...note(L.x0, 856, [
        own
          ? "Thirteen pages ago this was your music. Over the page is"
          : "Thirteen pages ago this was a playlist. Over the page is",
        "the earphone its sound points to, as the engine ranked it",
        own
          ? `for you: first of ${RUN.measured}, with its range.`
          : `for one sample listener: first of ${RUN.measured}, with its range.`,
      ]),
      t(L.x0, 1040, "Aurals", "script", 96, INK.navy, { gradient: WORDMARK_INK }),
      ...folio("left", 18),
    ],
  };
  const mood: PageSpec = feature.mood
    ? {
        id: "mood",
        side: "right",
        ground: INK.charcoal,
        label: `${feature.brand} ${feature.model}.`,
        elements: [
          {
            kind: "image",
            image: feature.mood,
            x: 0,
            y: 0,
            w: 1000,
            h: 1250,
            fit: "cover",
            focus: [0.5, 0.5],
          },
          ...caption("right", feature.brand, feature.model),
          ...folio("right", 19, true),
        ],
      }
    : {
        id: "mood",
        side: "right",
        ground: INK.navy,
        label: "The selection.",
        elements: [
          { kind: "rule", x: R.mid - 40, y: 625, w: 80, weight: 1.4, fill: INK.gold },
          ...folio("right", 19, true),
        ],
      };

  /* ---- spread 10: the selection ---- */
  const plateImage = feature.plate ? IMAGES[feature.plate] : null;
  const plate: PageSpec = plateImage
    ? {
        id: "plate",
        side: "left",
        ground: feature.plateGround,
        label: `${feature.brand} ${feature.model}, photographed.`,
        elements: [
          {
            kind: "image",
            image: plateImage.id,
            x: 30,
            y: 196,
            w: 940,
            h: 820,
            fit: "contain",
            focus: [0.5, 0.5],
            blend: "multiply",
          },
          ...(feature.introduction
            ? [
                t(L.x0, 1066, `“${feature.introduction.quote}”`, "serif-italic", 25, INK.text, {
                  opacity: 0.9,
                }),
                t(L.x0, 1100, `${feature.introduction.by}, on its product page`, "sans", 12.5, INK.muted, {
                  weight: 400,
                }),
              ]
            : []),
          t(L.x1, 1100, `Photograph: ${shorten(plateImage.source.name, 40)}`, "sans", 12.5, INK.muted, {
            weight: 400,
            opacity: 0.85,
            anchor: "end",
          }),
          ...folio("left", 20),
        ],
      }
    : {
        // No photograph has been gathered for it yet: the page says so, and
        // prints the name where the photograph would be, rather than a stand-in.
        id: "plate",
        side: "left",
        ground: INK.ivory,
        label: `${feature.brand} ${feature.model}.`,
        elements: [
          t(L.x0, 420, feature.brand.toUpperCase(), "sans", 18, INK.muted, { weight: 500, tracking: 0.42 }),
          t(L.x0 - 8, 600, shorten(feature.model, 14), "serif", 170, INK.navy),
          { kind: "rule", x: L.x0, y: 680, w: 72, weight: 1.6, fill: INK.print },
          ...note(L.x0, 740, [
            "No photograph of this earphone has been gathered yet.",
            "It was chosen by how it measures, not by how it looks.",
          ]),
          ...folio("left", 20),
        ],
      };

  const rec = feature.recommendation;
  const selected: PageSpec = {
    id: "selected",
    side: "right",
    ground: INK.ivory,
    label: `${feature.brand} ${feature.model}. ${feature.headline.join(" ")}`,
    elements: [
      label(R.x0, 170, "THE SELECTION"),
      ...(feature.provenance === "demo"
        ? [
            t(R.x1, 170, "SAMPLE LISTENER", "sans", 12, INK.muted, {
              anchor: "end",
              weight: 500,
              tracking: 0.3,
            }),
          ]
        : []),
      t(R.x0, 282, feature.brand.toUpperCase(), "sans", 21, INK.text, { weight: 500, tracking: 0.42 }),
      t(R.x0 - 10, 486, feature.model, "serif", modelSize(feature.model), INK.navy),
      t(R.x0, 566, feature.headline[0], "serif-italic", 46, INK.text),
      t(R.x0, 614, feature.headline[1], "serif-italic", 46, INK.text),
      { kind: "rule", x: R.x0, y: 662, w: R.x1 - R.x0, weight: 1, fill: INK.print, opacity: 0.7 },
      ...(rec
        ? [
            t(R.x0, 710, "EXPECTED RATING", "sans", 12, INK.muted, { weight: 500, tracking: 0.3 }),
            t(R.x0, 774, String(Math.round(rec.mean)), "serif", 66, INK.navy),
            t(
              R.x0 + 96,
              774,
              `${Math.round(rec.low)}–${Math.round(rec.high)} · ${rec.match} match · rank ${rec.rank} of ${rec.of}`,
              "sans",
              15,
              INK.muted,
              {
                weight: 400,
              },
            ),
          ]
        : []),
      ...(feature.price
        ? [
            t(R.x1, 710, "PRICE", "sans", 12, INK.muted, { weight: 500, tracking: 0.3, anchor: "end" }),
            t(R.x1, 774, feature.price.value, "serif", 46, INK.navy, { anchor: "end" }),
            t(R.x1, 800, feature.price.note, "sans", 11.5, INK.muted, { weight: 400, anchor: "end" }),
          ]
        : []),
      ...(feature.fit.length
        ? [
            t(R.x0, 832, "WHY IT FITS", "sans", 12, INK.muted, { weight: 500, tracking: 0.3 }),
            ...feature.fit.map((line, i) =>
              t(R.x0, 864 + i * 26, line, "sans", 15.5, INK.text, { weight: 400 }),
            ),
          ]
        : []),
      ...feature.facts.flatMap((fact, i): El[] => {
        const y = 948 + i * 34;
        return [
          t(R.x0, y, fact.label.toUpperCase(), "sans", 11, INK.muted, { weight: 500, tracking: 0.3 }),
          t(R.x0 + 220, y + 2, fact.value, "serif", 23, INK.text),
        ];
      }),
      t(
        R.x0,
        1168,
        [
          `Specifications: ${feature.factsSource.name}`,
          feature.measurement ? `Measured by ${feature.measurement.by}, ${feature.measurement.rig}` : null,
        ]
          .filter(Boolean)
          .join("  ·  "),
        "sans",
        11.5,
        INK.muted,
        { weight: 400, opacity: 0.9 },
      ),
      t(R.x1, 1168, "21", "sans", 15, INK.muted, { anchor: "end", weight: 500, tracking: 0.18 }),
    ],
  };

  return {
    leaves: [
      { front: title, back: listening },
      { front: aether, back: analysis },
      { front: bands, back: dna },
      { front: sa6, back: regions },
      { front: voices, back: detail },
      { front: space, back: shell },
      { front: supermix, back: blessing },
      { front: performer, back: method },
      { front: shortlist, back: beyond },
      { front: mood, back: plate },
    ],
    plate,
    selected,
    pair: feature.pair,
  };
}
