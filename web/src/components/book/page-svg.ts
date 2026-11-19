import { IMAGES, PAGE, type ImageId } from "@/components/book/edition";

/**
 * One page, as SVG — the single source of both the texture printed on the 3D
 * leaf and the DOM page that replaces it at the end.
 *
 * The handoff can only be invisible if the two are the same picture, and two
 * renderers of one layout (canvas for the texture, HTML for the page) never
 * are: baselines, letter-spacing and image cropping all drift by a pixel or
 * two. So there is one renderer. For the texture its output is rasterised
 * (with fonts and photographs embedded, as an SVG image must have them); for
 * the DOM the same markup is placed in the document, where the same font
 * files render it. Same coordinates, same glyphs, same crop.
 */

export type FontKey = "serif" | "serif-italic" | "sans" | "script";

export type PageElement =
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      font: FontKey;
      size: number;
      weight?: number;
      /** In em. */
      tracking?: number;
      anchor?: "start" | "middle" | "end";
      fill: string;
      /** Ink that shifts across the line, left to right (the wordmark's). */
      gradient?: readonly string[];
      opacity?: number;
    }
  | {
      kind: "image";
      image: ImageId;
      x: number;
      y: number;
      w: number;
      h: number;
      fit: "cover" | "contain";
      /** Which part of the photograph to keep when cropping, 0–1 each way. */
      focus?: readonly [number, number];
      blend?: "multiply";
    }
  | { kind: "rule"; x: number; y: number; w: number; weight: number; fill: string; opacity?: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; opacity?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; stroke: string; weight: number; opacity?: number }
  | { kind: "shade"; y0: number; y1: number; from: number; to: number; color: string }
  | { kind: "leader"; x1: number; x2: number; y: number; fill: string };

export type PageSpec = {
  id: string;
  side: "left" | "right";
  ground: string;
  /** What the page says, for assistive technology. */
  label: string;
  elements: readonly PageElement[];
};

export const FONT_FAMILY = {
  serif: "Aurals Serif",
  sans: "Aurals Sans",
  script: "Aurals Script",
} as const;

export type Resolve = {
  image: (id: ImageId) => string;
  /** The paper grain tile. */
  grain: string;
  /** @font-face rules to embed, or "" when the document provides the fonts. */
  fontCss: string;
};

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function n(v: number) {
  return Number(v.toFixed(2));
}

function text(el: Extract<PageElement, { kind: "text" }>, id: string) {
  const family =
    el.font === "sans" ? FONT_FAMILY.sans : el.font === "script" ? FONT_FAMILY.script : FONT_FAMILY.serif;
  const style = el.font === "serif-italic" ? "italic" : "normal";
  const weight = el.weight ?? 400;
  const spacing = (el.tracking ?? 0) * el.size;
  // Letter-spacing is added after every character, the last included, so a
  // centred or right-set line would sit off by that trailing space. Shift it
  // back.
  const anchor = el.anchor ?? "start";
  const x = anchor === "middle" ? el.x + spacing / 2 : anchor === "end" ? el.x + spacing : el.x;
  let fill = el.fill;
  let defs = "";
  if (el.gradient && el.gradient.length > 1) {
    const stops = el.gradient
      .map((c, i) => `<stop offset="${n(i / (el.gradient!.length - 1))}" stop-color="${c}"/>`)
      .join("");
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>`;
    fill = `url(#${id})`;
  }
  return (
    defs +
    `<text x="${n(x)}" y="${n(el.y)}" font-family="${family}" font-style="${style}" font-weight="${weight}" ` +
    `font-size="${n(el.size)}"${spacing ? ` letter-spacing="${n(spacing)}"` : ""} text-anchor="${anchor}" ` +
    `fill="${fill}"${el.opacity !== undefined ? ` fill-opacity="${el.opacity}"` : ""}>${escape(el.text)}</text>`
  );
}

function image(el: Extract<PageElement, { kind: "image" }>, id: string, href: string) {
  const meta = IMAGES[el.image];
  const scale =
    el.fit === "cover"
      ? Math.max(el.w / meta.width, el.h / meta.height)
      : Math.min(el.w / meta.width, el.h / meta.height);
  const dw = meta.width * scale;
  const dh = meta.height * scale;
  const [fx, fy] = el.focus ?? [0.5, 0.5];
  const dx = el.x + (el.w - dw) * fx;
  const dy = el.y + (el.h - dh) * fy;
  const blend = el.blend ? ` style="mix-blend-mode:${el.blend}"` : "";
  return (
    `<clipPath id="${id}"><rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}"/></clipPath>` +
    `<image href="${href}" x="${n(dx)}" y="${n(dy)}" width="${n(dw)}" height="${n(dh)}" ` +
    `preserveAspectRatio="none" clip-path="url(#${id})"${blend}/>`
  );
}

/**
 * The page as an SVG document.
 *
 * `width`/`height` set the rasterisation size; the drawing is always in the
 * 1000 × 1250 page space.
 */
export function pageSvg(page: PageSpec, resolve: Resolve, size?: { width: number; height: number }) {
  const uid = `bk-${page.id}`;
  const body: string[] = [];
  page.elements.forEach((el, i) => {
    switch (el.kind) {
      case "text":
        body.push(text(el, `${uid}-t${i}`));
        break;
      case "rect":
        body.push(
          `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" fill="${el.fill}"` +
            `${el.opacity !== undefined ? ` fill-opacity="${el.opacity}"` : ""}/>`,
        );
        break;
      case "image":
        body.push(image(el, `${uid}-c${i}`, resolve.image(el.image)));
        break;
      case "rule":
        body.push(
          `<rect x="${n(el.x)}" y="${n(el.y - el.weight / 2)}" width="${n(el.w)}" height="${n(el.weight)}" fill="${el.fill}"` +
            `${el.opacity !== undefined ? ` fill-opacity="${el.opacity}"` : ""}/>`,
        );
        break;
      case "circle":
        body.push(
          `<circle cx="${n(el.cx)}" cy="${n(el.cy)}" r="${n(el.r)}" fill="none" stroke="${el.stroke}" ` +
            `stroke-width="${n(el.weight)}"${el.opacity !== undefined ? ` stroke-opacity="${el.opacity}"` : ""}/>`,
        );
        break;
      case "shade":
        body.push(
          `<linearGradient id="${uid}-s${i}" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${el.color}" stop-opacity="${el.from}"/>` +
            `<stop offset="1" stop-color="${el.color}" stop-opacity="${el.to}"/></linearGradient>` +
            `<rect x="0" y="${n(el.y0)}" width="${PAGE.w}" height="${n(el.y1 - el.y0)}" fill="url(#${uid}-s${i})"/>`,
        );
        break;
      case "leader": {
        const dots: string[] = [];
        for (let x = el.x1; x <= el.x2; x += 11) dots.push(`<circle cx="${n(x)}" cy="${n(el.y)}" r="1.25"/>`);
        body.push(`<g fill="${el.fill}" fill-opacity="0.55">${dots.join("")}</g>`);
        break;
      }
    }
  });

  // The gutter: a soft shadow where the page turns into the binding. Present
  // in both the texture and the DOM page, so the handoff keeps it.
  const gutterLeft = page.side === "right";
  const gutter =
    `<linearGradient id="${uid}-g" x1="${gutterLeft ? 0 : 1}" y1="0" x2="${gutterLeft ? 1 : 0}" y2="0">` +
    `<stop offset="0" stop-color="#1a1408" stop-opacity="0.16"/>` +
    `<stop offset="0.045" stop-color="#1a1408" stop-opacity="0.05"/>` +
    `<stop offset="0.12" stop-color="#1a1408" stop-opacity="0"/></linearGradient>` +
    `<rect width="${PAGE.w}" height="${PAGE.h}" fill="url(#${uid}-g)"/>`;

  // Paper grain, multiplied. 512 px of grain spans 30 mm of page: 125 units.
  const grain =
    `<pattern id="${uid}-p" patternUnits="userSpaceOnUse" width="125" height="125">` +
    `<image href="${resolve.grain}" width="125" height="125"/></pattern>` +
    `<rect width="${PAGE.w}" height="${PAGE.h}" fill="url(#${uid}-p)" opacity="0.13" style="mix-blend-mode:multiply"/>`;

  const dims = size ? ` width="${size.width}" height="${size.height}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE.w} ${PAGE.h}"${dims} ` +
    `preserveAspectRatio="none" role="img" aria-label="${escape(page.label)}">` +
    (resolve.fontCss ? `<style>${resolve.fontCss}</style>` : "") +
    `<rect width="${PAGE.w}" height="${PAGE.h}" fill="${page.ground}"/>` +
    body.join("") +
    grain +
    gutter +
    `</svg>`
  );
}
