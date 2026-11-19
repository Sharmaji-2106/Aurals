import { IMAGES, PAGE, type Edition, type ImageId } from "@/components/book/edition";
import { pageSvg, type PageSpec, type Resolve } from "@/components/book/page-svg";

/**
 * Getting the book's printed matter ready.
 *
 * Pages are rasterised from the same SVG the DOM page renders (see
 * `page-svg.ts`). An SVG drawn as an image is sealed off from the document: it
 * cannot use the page's web fonts or fetch photographs, so for the texture
 * both are embedded as data URIs. The DOM version references the same files
 * by URL.
 *
 * A photograph that fails to load is replaced by a placeholder that says what
 * is missing, in both renderings — never by a different photograph, and never
 * silently.
 */

export const FONT_FILES = [
  { family: "Aurals Serif", style: "normal", weight: "400", url: "/book/fonts/InstrumentSerif-Regular.ttf" },
  { family: "Aurals Serif", style: "italic", weight: "400", url: "/book/fonts/InstrumentSerif-Italic.ttf" },
  { family: "Aurals Sans", style: "normal", weight: "100 900", url: "/book/fonts/Geist-Variable.ttf" },
  { family: "Aurals Script", style: "normal", weight: "400", url: "/book/fonts/Allura-Regular.ttf" },
] as const;

export const GRAIN_URL = "/book/tex/paper-grain.png";

async function asDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** A restrained stand-in that names the missing asset. */
export function placeholder(id: ImageId) {
  const meta = IMAGES[id];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${meta.width} ${meta.height}">` +
    `<rect width="100%" height="100%" fill="#DDD2BF"/>` +
    `<text x="50%" y="48%" text-anchor="middle" font-family="sans-serif" font-size="${meta.width * 0.032}" fill="#5D6079">` +
    `Photograph unavailable</text>` +
    `<text x="50%" y="55%" text-anchor="middle" font-family="sans-serif" font-size="${meta.width * 0.026}" fill="#5D6079">` +
    `${meta.brand} ${meta.model}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type Embeds = {
  /** For rasterising: everything inline. */
  texture: Resolve;
  /** For the document: files by URL, placeholders where a file failed. */
  dom: Resolve;
  missing: ImageId[];
};

export async function loadEmbeds(): Promise<Embeds> {
  const fonts = await Promise.all(
    FONT_FILES.map(
      async (f) =>
        `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};` +
        `src:url(${await asDataUrl(f.url)}) format("truetype")}`,
    ),
  );
  const ids = Object.keys(IMAGES) as ImageId[];
  const missing: ImageId[] = [];
  const inline = new Map<ImageId, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        inline.set(id, await asDataUrl(IMAGES[id].file));
      } catch {
        missing.push(id);
        inline.set(id, placeholder(id));
      }
    }),
  );
  const grain = await asDataUrl(GRAIN_URL);
  return {
    texture: { image: (id) => inline.get(id) ?? placeholder(id), grain, fontCss: fonts.join("") },
    dom: {
      image: (id) => (missing.includes(id) ? placeholder(id) : IMAGES[id].file),
      grain: GRAIN_URL,
      fontCss: "",
    },
    missing,
  };
}

/** Rasterise one page at `width` pixels wide (height follows the page's 4:5). */
export async function rasterise(page: PageSpec, resolve: Resolve, width: number): Promise<HTMLCanvasElement> {
  const height = Math.round((width * PAGE.h) / PAGE.w);
  const svg = pageSvg(page, resolve, { width, height });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type PrintedPages = {
  leaves: { front: HTMLCanvasElement; back: HTMLCanvasElement }[];
  selected: HTMLCanvasElement;
};

/**
 * Every page the camera will see.
 *
 * The pages that pass by are printed at 1024 px; the two the camera ends on are
 * printed at the resolution the final frame actually shows them at, up to
 * 2048 px, so the texture is still crisp at the moment the DOM takes over.
 */
export async function printEdition(
  edition: Edition,
  resolve: Resolve,
  finalWidth: number,
): Promise<PrintedPages> {
  // The pages the viewer rests on are printed sharper than the ones that
  // riffle past; nobody reads a page that is on screen for a sixth of a second,
  // and a book's worth of 1024 px pages is a lot of GPU memory to spend.
  const resting = 1024;
  const passing = 768;
  const last = edition.leaves.length - 1;
  const leaves = await Promise.all(
    edition.leaves.map(async (leaf, i) => ({
      front: await rasterise(leaf.front, resolve, i <= 2 ? resting : passing),
      back: await rasterise(leaf.back, resolve, i === last ? finalWidth : i <= 1 ? resting : passing),
    })),
  );
  const selected = await rasterise(edition.selected, resolve, finalWidth);
  return { leaves, selected };
}

/** How wide the final pages need to be printed for this screen. */
export function finalPrintWidth(pageWidthCss: number, dpr: number) {
  const needed = pageWidthCss * Math.min(dpr, 2);
  return Math.min(2048, Math.max(1024, Math.ceil(needed / 256) * 256));
}
