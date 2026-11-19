/**
 * The hours of the evening AURALS lives in.
 *
 * Every page holds an hour, and the hour decides the light: the sky the scene
 * paints, the glow the page's atmosphere carries, the accent a section leans
 * on. The landing page runs through all of them as it scrolls; each step of
 * the journey holds one, later as you go — you start at golden hour and meet
 * your sound after dark.
 *
 * Hours are continuous (0 = golden hour … 4 = night) so scenes can move
 * between them; `HOUR` names the stops.
 */

export const HOUR = { golden: 0, sunset: 1, dusk: 2, blue: 3, night: 4 } as const;
export type HourName = keyof typeof HOUR;

type Light = {
  /** The page's atmosphere: a glow from the sky (top left) and from the horizon (bottom right). */
  sky: string;
  horizon: string;
  /** The accent the hour leans on, for rules, marks and focus. */
  accent: string;
  label: string;
};

export const LIGHT: Record<HourName, Light> = {
  golden: {
    sky: "rgb(255 168 107 / 0.16)",
    horizon: "rgb(255 201 119 / 0.2)",
    accent: "#ffc977",
    label: "Golden hour",
  },
  sunset: {
    sky: "rgb(255 92 138 / 0.14)",
    horizon: "rgb(255 122 89 / 0.22)",
    accent: "#ff7a59",
    label: "Sunset",
  },
  dusk: {
    sky: "rgb(198 83 217 / 0.15)",
    horizon: "rgb(255 92 138 / 0.18)",
    accent: "#ff5c8a",
    label: "Dusk",
  },
  blue: {
    sky: "rgb(61 139 255 / 0.15)",
    horizon: "rgb(123 77 255 / 0.18)",
    accent: "#3d8bff",
    label: "Blue hour",
  },
  night: {
    sky: "rgb(70 224 255 / 0.08)",
    horizon: "rgb(255 92 138 / 0.16)",
    accent: "#46e0ff",
    label: "After dark",
  },
};

/** The CSS variables `.atmosphere` reads, for an hour. */
export function hourStyle(hour: HourName): Record<string, string> {
  const light = LIGHT[hour];
  return { "--hour-sky": light.sky, "--hour-horizon": light.horizon, "--hour-accent": light.accent };
}
