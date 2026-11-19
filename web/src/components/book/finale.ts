import { BOOK, BLOCK_TOP, LEAVES, T, restLeftY } from "@/components/book/contract";
import { finalCamera, finaleAt, spreadLayout } from "@/components/book/choreography";
import { IMAGES, PAGE, type Edition } from "@/components/book/edition";
import { makeLeaves, restLeftExtent } from "@/components/book/leaf";
import type { PageSpec } from "@/components/book/page-svg";

/**
 * The ending, as geometry: where everything is at one instant.
 *
 * After the handoff the film is the DOM, and the camera is a transform. A
 * camera perpendicular to a flat page that moves toward or away from it sees
 * exactly a scale, so each "camera move" here is a scale about a point, and it
 * stays sharp at any magnification.
 *
 * Two things are drawn, and this module positions both:
 *
 * - **The overlay**: the spread the 3D book ended on, and a cutout of the
 *   product registered to its printed photograph pixel for pixel. The camera
 *   pushes into the photograph until the earphones fill the frame.
 * - **The real `/match` page**, underneath. Its product card shows the same
 *   photograph (the catalogue's image of this earphone is the same pixels). At
 *   the macro its transform puts that image exactly where the overlay's
 *   cutout is, so when the overlay dissolves nothing moves; the pullback then
 *   eases the page's transform back to none, and the product card, then the
 *   page, come into frame around the product.
 *
 * Everything is a pure function of `time` and of where the page's own image
 * sits (`landing`, measured by the caller) — so the ending scrubs, replays and
 * skips like the rest of the film.
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** The demo cutout's geometry, from design/book/cutout.py (image-relative, 0–1).
 *  Each edition carries its own (`Edition.pair`); this is the sample's. */
export const CUTOUT = {
  pair: { x: 0.065, y: 0.327, w: 0.865, h: 0.365 },
} as const;

/**
 * Where the real page's product photograph is, at rest: its image box (the
 * square the 1000 × 1000 photograph is drawn into), in viewport pixels, with
 * the document scrolled to `scroll`; and the scroll positions of the two
 * compositions the ending lands on.
 */
export type Landing = {
  image: Rect;
  /** The document scroll at which the product card is composed. */
  scroll: number;
  /** The document scroll at which the opening section (the Sound Card) fills the screen. */
  dna: number;
  /** The page layer's own top-left in the document (its transform origin). */
  origin: { x: number; y: number };
};

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(a: number, b: number, v: number) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function mixHex(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(" ")})`;
}
function along(stops: readonly (readonly [number, string])[], t: number) {
  if (t <= stops[0][0]) return mixHex(stops[0][1], stops[0][1], 0);
  for (let i = 0; i < stops.length - 1; i++) {
    const [ta, ca] = stops[i];
    const [tb, cb] = stops[i + 1];
    if (t <= tb) return mixHex(ca, cb, smoothstep(ta, tb, t));
  }
  const last = stops[stops.length - 1][1];
  return mixHex(last, last, 0);
}

/** Where the plate's photograph is drawn on its page: the image element's
 *  box, contain-fitted. Page units. */
export function plateImageBox(page: PageSpec) {
  const el = page.elements.find((e) => e.kind === "image");
  if (!el || el.kind !== "image") return { x: 90, y: 196, w: 820, h: 820 };
  const meta = IMAGES[el.image];
  const scale = Math.min(el.w / meta.width, el.h / meta.height);
  const w = meta.width * scale;
  const h = meta.height * scale;
  return { x: el.x + (el.w - w) / 2, y: el.y + (el.h - h) / 2, w, h };
}

/** The left page rests lower than the right, so it projects a little smaller. */
export function projectedLeftPage(width: number, height: number) {
  const { pageW } = spreadLayout(width, height);
  const cam = finalCamera({ width, height, fov: 0 });
  const distance = cam.position[1] - BLOCK_TOP;
  const lower = BLOCK_TOP - restLeftY(LEAVES - 1);
  const depth = distance / (distance + lower);
  const reach = Math.abs(restLeftExtent(makeLeaves()[LEAVES - 1])) / BOOK.pageW;
  return { scale: depth, shift: (1 - reach) * pageW * depth };
}

/**
 * The palette the light passes through as the world changes: ivory paper, the
 * sunset the book was read in, dusk, and then the night the app is drawn in —
 * ending on the colour of the product card's own plinth, so the page that
 * appears under it is already the colour of what was there.
 */
const WASH_CENTRE = [
  [0, "#f3e3cd"],
  [0.22, "#f4b391"],
  [0.42, "#d1708f"],
  [0.6, "#5c3a6e"],
  [0.78, "#17121d"],
  [1, "#0d0d10"],
] as const;
const WASH_EDGE = [
  [0, "#eedcc4"],
  [0.22, "#d98a92"],
  [0.42, "#7a4a86"],
  [0.6, "#2a1d3c"],
  [0.78, "#0b0a10"],
  [1, "#09090b"],
] as const;

export type FinaleFrame = {
  /** The spread (paper) layer: its camera transform and opacity. */
  spread: { transform: string; opacity: number; leftTransform: string; swap: number };
  /** The overlay's product: its rect on screen, and how visible. */
  product: { rect: Rect; opacity: number; sheen: number };
  /** The colour wash the world changes through. */
  wash: { opacity: number; background: string };
  /** The real page's camera, or none at rest. */
  page: { visible: boolean; transform: string | null; k: number };
  /** Where the document should be scrolled. */
  scroll: number | null;
  /** True once the overlay has nothing left to show. */
  overlayDone: boolean;
};

export function finaleFrame(
  time: number,
  viewport: { width: number; height: number },
  edition: Edition,
  landing: Landing | null,
): FinaleFrame {
  const { width, height } = viewport;
  const f = finaleAt(time);
  const flip = smoothstep(T.handoff[1], T.push[0], time);
  const swap = smoothstep(T.push[0], T.push[0] + 0.35, time);

  /* ---- the spread, and the push into its photograph ---- */
  const layout = spreadLayout(width, height);
  const projected = projectedLeftPage(width, height);
  const leftScale = projected.scale + (1 - projected.scale) * flip;
  const leftShift = projected.shift * (1 - flip);
  const spreadX = layout.gutter - layout.pageW;
  const unit = layout.pageW / PAGE.w;
  const box = plateImageBox(edition.plate);
  const plate: Rect = {
    x: spreadX + box.x * unit,
    y: layout.top + box.y * unit,
    w: box.w * unit,
    h: box.h * unit,
  };
  // The camera aims at the pair's centre and closes until the earphones fill
  // the frame: nine tenths of its width, or of its height on a tall screen.
  const pair = edition.pair;
  const focus = {
    x: plate.x + (pair.x + pair.w / 2) * plate.w,
    y: plate.y + (pair.y + pair.h / 2) * plate.h,
  };
  const pairW = pair.w * plate.w;
  const pairH = pair.h * plate.h;
  const macro = Math.min((width * 0.9) / pairW, (height * 0.62) / pairH);
  const aim = { x: width / 2, y: height * 0.48 };
  const S = 1 + (macro - 1) * f.push;
  const Q = { x: focus.x + (aim.x - focus.x) * f.push, y: focus.y + (aim.y - focus.y) * f.push };
  const onScreen = (r: Rect): Rect => ({
    x: Q.x + (r.x - focus.x) * S,
    y: Q.y + (r.y - focus.y) * S,
    w: r.w * S,
    h: r.h * S,
  });
  const atMacro = onScreen(plate);

  /* ---- the colour of the world ---- */
  const theme = f.theme;
  const washIn = smoothstep(0, 0.3, theme);
  const washOut = smoothstep(0.74, 1, theme);
  const wash = {
    opacity: washIn * (1 - washOut),
    background: `radial-gradient(ellipse 72% 64% at 50% 46%, ${along(WASH_CENTRE, theme)}, ${along(WASH_EDGE, theme)})`,
  };

  /* ---- the real page's camera ---- */
  let page: FinaleFrame["page"] = { visible: false, transform: null, k: 1 };
  let scroll: number | null = null;
  if (landing) {
    const rest = landing.image;
    const k0 = atMacro.w / rest.w;
    const c0 = { x: atMacro.x + atMacro.w / 2, y: atMacro.y + atMacro.h / 2 };
    const c1 = { x: rest.x + rest.w / 2, y: rest.y + rest.h / 2 };
    // Scale changes geometrically, so the pull reads as constant speed.
    const k = Math.pow(k0, 1 - f.pull);
    const c = { x: c0.x + (c1.x - c0.x) * f.pull, y: c0.y + (c1.y - c0.y) * f.pull };
    // The page's local point at c1 must land on c, scaled by k about its origin.
    const W = { x: landing.origin.x, y: landing.origin.y - landing.scroll };
    const tx = c.x - W.x - k * (c1.x - W.x);
    const ty = c.y - W.y - k * (c1.y - W.y);
    // Shown (under the still-opaque overlay) from the end of the handoff, on a
    // still frame: its first paint is expensive, and should not land on a
    // frame where something is moving.
    const visible = time >= T.handoff[1];
    page = {
      visible,
      transform: f.pull >= 1 ? null : `translate(${tx}px, ${ty}px) scale(${k})`,
      k,
    };
    scroll = landing.scroll + (landing.dna - landing.scroll) * f.scroll;
  }

  return {
    spread: {
      transform: `translate(${Q.x - focus.x * S}px, ${Q.y - focus.y * S}px) scale(${S})`,
      opacity: 1 - smoothstep(0.18, 0.36, theme),
      leftTransform: `translateX(${leftShift}px) scale(${leftScale})`,
      swap,
    },
    product: {
      rect: atMacro,
      // The cutout holds until the page's own photograph is under it, then
      // gives way to it: the same pixels, now in the app's grade.
      opacity: swap * (1 - smoothstep(0.7, 1, theme)),
      sheen: f.sheen,
    },
    wash,
    page,
    scroll,
    overlayDone: theme >= 1,
  };
}

/** The ending's stages, for the transport and for tests. */
export function finaleStage(time: number) {
  if (time < T.handoff[1]) return "film" as const;
  if (time < T.theme[0]) return "macro" as const;
  if (time < T.pull[0]) return "theme" as const;
  if (time < T.scroll[0]) return "card" as const;
  return "sound" as const;
}
