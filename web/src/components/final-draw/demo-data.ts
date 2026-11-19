import type { WinningIem } from "@/components/final-draw/contract";

/**
 * Development data for the isolated studio.
 *
 * These are not invented values. The earphone is a real entry in the Auralis
 * catalogue, and the score, interval and reason were captured from an actual
 * run of the recommendation engine on 8 November 2026. They are a snapshot, so
 * the studio is labelled as a development demo and the card itself carries the
 * provenance line — nothing here is presented as a live recommendation.
 *
 * On `/match` the scene is handed the real `Recommendation` instead and none of
 * this is used.
 */
export const DEMO_WINNER: WinningIem = {
  brand: "Truthear",
  model: "x Crinacle Zero RED",
  score: { mean: 84.6, low: 79.7, high: 89.2 },
  reason: "Treble sits within 0.3 dB of your target, inside your ±1.6 dB range.",
  provenance: "Captured from a real engine run, 8 November 2026",
};

/** How many measured earphones the catalogue held at capture time. */
export const DEMO_MEASURED_COUNT = 203;

/**
 * The earphone's real measured frequency response, for the studio's card face.
 *
 * Not a drawn approximation and not a stand-in: these are the actual points
 * Auralis holds for this earphone, read out of the catalogue and downsampled
 * from 695 samples to 96 for drawing. Measured by oratory1990 on a GRAS 43ACB
 * and redistributed through AutoEq, which is an MIT-licensed project; the
 * measurement itself is used here for non-commercial research with attribution,
 * and the credit travels with the curve wherever it is shown.
 *
 * In production the card face carries the real `ProductArt` for the real
 * recommendation instead, and none of this is used.
 */
export const DEMO_RESPONSE_PATH =
  "M6.0,9.19 L7.77,9.34 L9.54,9.43 L11.31,9.23 L13.07,9.04 L14.84,9.04 L16.61,9.28 L18.38,9.58 L20.15,9.84 L21.92,10.15 L23.68,10.45 L25.45,10.75 L27.22,11.14 L28.99,11.56 L30.76,11.97 L32.53,12.58 L34.29,13.16 L36.06,13.79 L37.83,14.6 L39.6,15.36 L41.37,16.22 L43.14,17.07 L44.91,18.18 L46.67,19.2 L48.44,20.22 L50.21,21.41 L51.98,22.45 L53.75,23.43 L55.52,24.21 L57.28,24.89 L59.05,25.21 L60.82,25.49 L62.59,25.6 L64.36,25.47 L66.13,25.36 L67.89,25.21 L69.66,25.06 L71.43,24.91 L73.2,24.8 L74.97,24.69 L76.74,24.6 L78.51,24.6 L80.27,24.6 L82.04,24.69 L83.81,24.8 L85.58,24.84 L87.35,24.91 L89.12,24.99 L90.88,24.99 L92.65,24.95 L94.42,24.8 L96.19,24.49 L97.96,24.0 L99.73,23.37 L101.49,22.41 L103.26,21.46 L105.03,20.52 L106.8,19.63 L108.57,18.89 L110.34,17.94 L112.11,16.75 L113.87,15.44 L115.64,14.47 L117.41,13.49 L119.18,12.19 L120.95,10.95 L122.72,9.71 L124.48,8.32 L126.25,7.3 L128.02,6.52 L129.79,6.0 L131.56,6.09 L133.33,6.56 L135.09,7.54 L136.86,8.89 L138.63,10.25 L140.4,11.84 L142.17,13.79 L143.94,15.38 L145.71,16.31 L147.47,16.16 L149.24,14.7 L151.01,12.82 L152.78,13.19 L154.55,20.09 L156.32,29.25 L158.08,34.57 L159.85,35.5 L161.62,34.33 L163.39,24.65 L165.16,27.14 L166.93,38.13 L168.69,40.06 L170.46,44.03 L172.23,56.8 L174.0,66.0";

export const DEMO_RESPONSE_CREDIT = "oratory1990 · GRAS 43ACB";
