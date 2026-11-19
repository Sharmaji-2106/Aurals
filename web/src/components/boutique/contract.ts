/**
 * The Boutique — the boundary between the environment and everything else.
 *
 * The scene is a fixed piece of joinery with seven displays in it. Nothing
 * about which product sits where is baked into the rendering: the displays are
 * built from `BOUTIQUE_PRODUCTS`, each of which carries its own anchor, so a
 * product can be added, removed or reordered by editing data alone. The
 * recommended one is whichever is marked `hero` — the scene has no opinion.
 */

export type BoutiqueProduct = {
  readonly slug: string;
  readonly rank: number;
  readonly brand: string;
  readonly model: string;
  readonly match: string;
  /** Predicted preference, with its 10-90 interval. The engine's numbers. */
  readonly mean: number;
  readonly low: number;
  readonly high: number;
  /** One reason the engine found for it, and one against. Its own words. */
  readonly strength: string | null;
  readonly tradeoff: string | null;
  /** Who measured it, and on what. Always shown beside the curve. */
  readonly measuredBy: string | null;
  readonly rig: string | null;
  readonly points: number | null;
  /** Its measured response, downsampled for drawing. */
  readonly curve: readonly number[];
  readonly niche: number;
  readonly hero: boolean;
  /** Where its display stands, in metres, three.js axes. */
  readonly anchor: readonly [number, number, number];
};

/* ----------------------------------------------------------------- camera --- */

export type Vec3 = readonly [number, number, number];

/** A place the camera can be, and what it is looking at from there. */
export type Mark = {
  readonly position: Vec3;
  readonly target: Vec3;
  /** Field of view in degrees. Narrowing it on approach reads as a lens change
   *  rather than as the room getting smaller. */
  readonly fov: number;
};

/**
 * The establishing shot.
 *
 * Elevated, three-quarter, far enough back that the whole wall and its
 * composition are legible, close enough that a display is still an object
 * rather than a speck.
 */
export const ESTABLISH: Mark = {
  position: [1.52, 1.76, 4.32],
  target: [0.0, 1.26, 0],
  fov: 40,
};

/** Square on to the whole wall, for reading the composition. */
export const WIDE: Mark = {
  position: [0.1, 1.5, 4.5],
  target: [0.02, 1.24, 0],
  fov: 40,
};

/** How close the camera settles to a display it has been sent to. */
export const FOCUS_DISTANCE = 1.42;
/** And how far to one side, so the shot is three-quarter rather than flat on. */
export const FOCUS_OFFSET_X = 0.42;
/** Raised slightly above the display, looking very slightly down at it. */
export const FOCUS_RISE = 0.13;
export const FOCUS_FOV = 38;

/** Where the camera goes to look at one display. Derived, never stored. */
export function markFor(product: BoutiqueProduct): Mark {
  const [x, y, z] = product.anchor;
  // Lean the approach away from the wall's centre, so the camera never ends up
  // looking straight down the wall and the joinery keeps its depth.
  const side = x >= 0 ? 1 : -1;
  return {
    position: [x + side * FOCUS_OFFSET_X, y + FOCUS_RISE, z + FOCUS_DISTANCE],
    target: [x, y + 0.012, z - 0.06],
    fov: product.hero ? FOCUS_FOV : FOCUS_FOV + 3,
  };
}

/* ------------------------------------------------------------------ phase --- */

/**
 * What the demo is doing. The overlay is a phase rather than a boolean so that
 * closing it returns to exactly the state it opened from, which is the one
 * behaviour the brief is explicit about.
 */
export type Phase = "establishing" | "browsing" | "focused" | "overlay";

/** The GLB, and the names the browser re-materialises by. */
export const MODEL_URL = "/boutique/boutique.glb";

/**
 * Material names as Blender wrote them. The browser rebuilds each one, because
 * procedural shaders do not survive glTF and baking this wall's grain into
 * textures would cost several megabytes to say what a few lines of noise say.
 */
export const MATERIAL = {
  walnut: "Walnut smoked",
  walnutMid: "Walnut mid",
  walnutLight: "Walnut light",
  walnutDark: "Walnut dark back",
  black: "Matte black",
  liner: "Niche liner",
  linerHero: "Niche liner hero",
  graphite: "Graphite card",
  graphiteHero: "Graphite card hero",
  brass: "Brass reveal",
  metal: "Brushed metal",
  curve: "Curve",
  curveHero: "Curve hero",
  strip: "Cove strip",
  stripHero: "Cove strip hero",
  ink: "Ink",
  inkDim: "Ink dim",
  floor: "Floor",
} as const;

/* ------------------------------------------------------------ recomposing --- */

/** The aspect the composition was framed for. */
const DESIGNED_ASPECT = 16 / 9;

/**
 * A portrait phone does not get the desktop shot pushed further away.
 *
 * A three-and-a-half metre wall seen through a tall, narrow frame is either
 * mostly off the sides or, if you retreat far enough to fit it, a row of specks.
 * Neither is the composition. So a narrow viewport is given a different one: it
 * comes in closer and looks at the central group, where the recommended display
 * is, and accepts that the far ends of the wall are out of shot.
 *
 * Between the two — a tablet, a short window — the camera simply backs off
 * enough to hold the same horizontal extent, which is the right answer when
 * there is nearly enough room already.
 */
export function adapt(mark: Mark, aspect: number): Mark {
  if (!Number.isFinite(aspect) || aspect <= 0) return mark;
  if (aspect >= DESIGNED_ASPECT) return mark;

  if (aspect < 0.95) {
    // Portrait: a different shot, centred on the hero group.
    const toward = 0.16;
    const pull = 0.52;
    return {
      position: [
        mark.target[0] + (mark.position[0] - mark.target[0]) * pull + toward * 0.3,
        mark.position[1] * 0.96,
        mark.target[2] + (mark.position[2] - mark.target[2]) * pull + 0.55,
      ],
      target: [mark.target[0] * 0.3 + toward * 0.7, mark.target[1], mark.target[2]],
      fov: Math.min(62, mark.fov * 1.3),
    };
  }

  // Landscape, but narrower than designed: hold the horizontal extent by
  // backing off, which is what a camera operator would do.
  const widen = Math.min(1.9, DESIGNED_ASPECT / aspect);
  return {
    position: [
      mark.target[0] + (mark.position[0] - mark.target[0]) * widen,
      mark.target[1] + (mark.position[1] - mark.target[1]) * widen,
      mark.target[2] + (mark.position[2] - mark.target[2]) * widen,
    ],
    target: mark.target,
    fov: mark.fov,
  };
}
