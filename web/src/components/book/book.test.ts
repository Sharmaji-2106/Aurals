import { boardPose } from "@/components/book/binding";
import { coverAt, finalCamera, spreadLayout } from "@/components/book/choreography";
import {
  BOOK,
  BLOCK_TOP,
  LEAVES,
  SEQUENCE_SECONDS,
  T,
  TURNS,
  restLeftY,
  restRightY,
} from "@/components/book/contract";
import { DEMO_FEATURE, IMAGES, editionPages } from "@/components/book/edition";
import { ROWS, SEGMENTS, deformLeaf, makeLeaves } from "@/components/book/leaf";
import { pageSvg } from "@/components/book/page-svg";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

const COLS = SEGMENTS + 1;

function shape(p: number, leafIndex = 0) {
  const leaf = makeLeaves()[leafIndex];
  const out = new Float32Array(COLS * (ROWS + 1) * 3);
  deformLeaf(leaf, p, out);
  return out;
}

describe("a leaf is paper", () => {
  it("never stretches: every row is exactly a page wide, at every instant", () => {
    for (const p of [0, 0.05, 0.2, 0.37, 0.5, 0.63, 0.8, 0.95, 1]) {
      const v = shape(p, 3);
      for (let r = 0; r <= ROWS; r++) {
        let length = 0;
        for (let j = 0; j < SEGMENTS; j++) {
          const a = (r * COLS + j) * 3;
          const b = a + 3;
          length += Math.hypot(v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]);
        }
        expect(length).toBeCloseTo(BOOK.pageW, 6);
      }
    }
  });

  it("starts flat on the right, at its place in the stack", () => {
    for (let i = 0; i < LEAVES; i++) {
      const v = shape(0, i);
      for (let k = 0; k < v.length; k += 3) expect(v[k + 1]).toBeCloseTo(restRightY(i), 6);
      expect(v[(COLS - 1) * 3]).toBeCloseTo(BOOK.pageW, 6);
    }
  });

  it("lands exactly on the leaf below it on the left", () => {
    for (let i = 0; i < LEAVES; i++) {
      const v = shape(1, i);
      const outer = (COLS - 1) * 3;
      expect(v[outer]).toBeLessThan(-0.2);
      expect(v[outer + 1]).toBeCloseTo(restLeftY(i), 5);
    }
  });

  it("lifts off the stack rather than passing through it", () => {
    // While the leaf is still over the right-hand page, no part of it may sink
    // into the pages beneath.
    for (const p of [0.02, 0.1, 0.2, 0.3, 0.4]) {
      const v = shape(p, 0);
      for (let k = 0; k < v.length; k += 3) {
        if (v[k] > 0.001) expect(v[k + 1]).toBeGreaterThanOrEqual(restRightY(0) - 1e-9);
      }
    }
  });

  it("is turned by its own schedule, last and slowest at the end", () => {
    expect(TURNS).toHaveLength(LEAVES);
    const last = TURNS[TURNS.length - 1];
    expect(last.duration).toBe(Math.max(...TURNS.map((t) => t.duration)));
    for (let i = 1; i < TURNS.length; i++) expect(TURNS[i].start).toBeGreaterThan(TURNS[i - 1].start);
  });
});

describe("the cover", () => {
  it("closes on the book and opens onto the table", () => {
    const shut = boardPose(0);
    expect(shut.angle).toBe(0);
    expect(shut.y).toBeCloseTo(BLOCK_TOP + BOOK.leaf * (LEAVES + 1) + 0.0001 + BOOK.board / 2, 6);
    const open = boardPose(1);
    expect(open.angle).toBeCloseTo(Math.PI, 9);
    // Lying on the table: its mid-plane half a board above the ground.
    expect(open.y).toBeCloseTo(BOOK.board / 2, 9);
    expect(open.x).toBeLessThan(-BOOK.bulge);
  });

  it("is fully open, and still, once its time is over", () => {
    const after = coverAt(T.cover[1] + 0.6);
    expect(after.c).toBe(1);
    expect(after.settle).toBeLessThan(1e-3);
    expect(coverAt(0).c).toBe(0);
  });
});

describe("the last frame and the DOM page are the same picture", () => {
  // The camera's final framing is derived from the DOM layout, so projecting
  // the right-hand page's corners must land on the DOM page's rectangle.
  const viewports = [
    { width: 1425, height: 900 },
    { width: 1270, height: 800 },
    { width: 1905, height: 1080 },
    { width: 1024, height: 768 },
    { width: 412, height: 915 },
  ];
  for (const viewport of viewports) {
    it(`at ${viewport.width}×${viewport.height}`, () => {
      const fov = 26;
      const layout = spreadLayout(viewport.width, viewport.height);
      const pose = finalCamera({ ...viewport, fov });
      const camera = new THREE.PerspectiveCamera(fov, viewport.width / viewport.height, 0.01, 20);
      camera.position.set(...pose.position);
      camera.up.set(0, 0, -1);
      camera.lookAt(...pose.target);
      camera.updateMatrixWorld();
      const project = (x: number, z: number) => {
        const p = new THREE.Vector3(x, BLOCK_TOP, z).project(camera);
        return { x: ((p.x + 1) / 2) * viewport.width, y: ((1 - p.y) / 2) * viewport.height };
      };
      const topLeft = project(0, -BOOK.pageH / 2);
      const bottomRight = project(BOOK.pageW, BOOK.pageH / 2);
      expect(topLeft.x).toBeCloseTo(layout.gutter, 3);
      expect(topLeft.y).toBeCloseTo(layout.top, 3);
      expect(bottomRight.x - topLeft.x).toBeCloseTo(layout.pageW, 3);
      expect(bottomRight.y - topLeft.y).toBeCloseTo(layout.pageH, 3);
    });
  }

  it("covers a landscape screen and fits a portrait one", () => {
    const wide = spreadLayout(1440, 900);
    expect(wide.mode).toBe("cover");
    expect(wide.pageW * 2).toBeGreaterThanOrEqual(1440);
    expect(wide.pageH).toBeGreaterThanOrEqual(900);
    const tall = spreadLayout(412, 915);
    expect(tall.mode).toBe("contain");
    expect(tall.pageW * 2).toBeCloseTo(412, 6);
  });
});

describe("the edition", () => {
  const edition = editionPages(DEMO_FEATURE);
  const pages = [...edition.leaves.flatMap((l) => [l.front, l.back]), edition.selected];

  it("prints only photographs that are recorded, with where they came from", () => {
    for (const page of pages) {
      for (const el of page.elements) {
        if (el.kind !== "image") continue;
        const meta = IMAGES[el.image];
        expect(meta).toBeDefined();
        expect(meta.source.pageUrl).toMatch(/^https:\/\//);
        expect(meta.source.imageUrl).toMatch(/^https:\/\//);
        expect(meta.licence.length).toBeGreaterThan(20);
      }
    }
  });

  it("prints the selected product's facts from its data, not from the layout", () => {
    const text = edition.selected.elements.flatMap((el) => (el.kind === "text" ? [el.text] : []));
    expect(text).toContain(DEMO_FEATURE.model);
    for (const fact of DEMO_FEATURE.facts) expect(text).toContain(fact.value);
    expect(text.join(" ")).toContain(DEMO_FEATURE.factsSource.name);
  });

  it("says the demo is a demo", () => {
    expect(DEMO_FEATURE.provenance).toBe("demo");
  });

  it("escapes what it prints", () => {
    const svg = pageSvg(
      {
        id: "t",
        side: "right",
        ground: "#fff",
        label: "<b>&",
        elements: [{ kind: "text", x: 0, y: 0, text: "<script>", font: "sans", size: 10, fill: "#000" }],
      },
      { image: () => "", grain: "", fontCss: "" },
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain('aria-label="&lt;b&gt;&amp;"');
  });
});

describe("the sample listener is real data, labelled as such", () => {
  it("is the captured run, unaltered", async () => {
    const { SAMPLE_LISTENER } = await import("@/components/book/sample-listener");
    expect(SAMPLE_LISTENER.bands).toHaveLength(9);
    expect(SAMPLE_LISTENER.measured).toBe(203);
    expect(SAMPLE_LISTENER.recommendation.slug).toBe("truthear-nova");
    expect(SAMPLE_LISTENER.recommendation.rank).toBe(1);
    expect(SAMPLE_LISTENER.recommendation.predicted_preference.mean).toBe(85.7);
    // The book's demo feature quotes the run; it does not restate it.
    expect(DEMO_FEATURE.recommendation?.mean).toBe(SAMPLE_LISTENER.recommendation.predicted_preference.mean);
    expect(DEMO_FEATURE.recommendation?.of).toBe(SAMPLE_LISTENER.measured);
  });

  it("is called a sample wherever its numbers are printed", () => {
    const edition = editionPages(DEMO_FEATURE);
    const pages = [...edition.leaves.flatMap((l) => [l.front, l.back]), edition.selected];
    for (const page of pages) {
      const text = page.elements.flatMap((el) => (el.kind === "text" ? [el.text] : [])).join(" ");
      if (/\b86\b|79–91|Neon Odyssey|\+3\.3/.test(text)) expect(text.toUpperCase()).toContain("SAMPLE");
    }
  });
});

describe("the sequence", () => {
  it("is ten leaves, one after another", () => {
    const edition = editionPages(DEMO_FEATURE);
    expect(edition.leaves).toHaveLength(LEAVES);
    expect(LEAVES).toBe(10);
  });

  it("hands over only once the 3D frame is still and flat", () => {
    const lastTurn = TURNS[TURNS.length - 1];
    expect(lastTurn.start + lastTurn.duration).toBeLessThan(T.flatten[0]);
    expect(T.flatten[1]).toBeLessThanOrEqual(T.handoff[0]);
    // The push begins after the DOM has fully taken over.
    expect(T.push[0]).toBeGreaterThanOrEqual(T.handoff[1]);
    // The light changes while the camera holds on the product, then it pulls
    // back, then the page scrolls — in that order, and inside the film.
    expect(T.theme[0]).toBeLessThan(T.push[1] + 0.01);
    expect(T.pull[0]).toBeGreaterThan(T.theme[0]);
    expect(T.scroll[0]).toBeGreaterThanOrEqual(T.pull[1]);
    expect(T.scroll[1]).toBeLessThanOrEqual(SEQUENCE_SECONDS);
  });
});

describe("the ending lands on the real page", () => {
  const edition = editionPages(DEMO_FEATURE);
  const viewport = { width: 1430, height: 900 };
  const landing = {
    image: { x: 214, y: 180, w: 449, h: 449 },
    scroll: 1259,
    dna: 0,
    origin: { x: 0, y: 0 },
  };

  it("registers the page's photograph to the macro, exactly", async () => {
    const { finaleFrame } = await import("@/components/book/finale");
    const frame = finaleFrame(T.pull[0], viewport, edition, landing);
    const k = frame.page.k;
    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(frame.page.transform ?? "");
    expect(match).not.toBeNull();
    const [tx, ty] = [Number(match![1]), Number(match![2])];
    // The page's image, as laid out (document scrolled to the card), through
    // the page's transform about its own origin.
    const W = { x: landing.origin.x, y: landing.origin.y - landing.scroll };
    const x = W.x + tx + k * (landing.image.x - W.x);
    const y = W.y + ty + k * (landing.image.y - W.y);
    expect(x).toBeCloseTo(frame.product.rect.x, 3);
    expect(y).toBeCloseTo(frame.product.rect.y, 3);
    expect(landing.image.w * k).toBeCloseTo(frame.product.rect.w, 3);
  });

  it("fills the frame with the earphones at the macro", async () => {
    const { finaleFrame, CUTOUT } = await import("@/components/book/finale");
    const { rect } = finaleFrame(T.push[1], viewport, edition, landing).product;
    const pair = rect.w * CUTOUT.pair.w;
    expect(pair / viewport.width).toBeGreaterThan(0.8);
    expect(pair / viewport.width).toBeLessThanOrEqual(0.9001);
  });

  it("rests with no transform, then scrolls to the Sound DNA", async () => {
    const { finaleFrame } = await import("@/components/book/finale");
    const card = finaleFrame(T.pull[1] + 0.01, viewport, edition, landing);
    expect(card.page.transform).toBeNull();
    expect(card.scroll).toBe(landing.scroll);
    const end = finaleFrame(SEQUENCE_SECONDS, viewport, edition, landing);
    expect(end.scroll).toBe(landing.dna);
    expect(end.overlayDone).toBe(true);
  });

  it("is the same listener the book is printed for", async () => {
    const { SAMPLE_MATCH } = await import("@/components/book/sample-match");
    const [first] = SAMPLE_MATCH.recommendations.items;
    expect(first.slug).toBe(DEMO_FEATURE.slug);
    expect(first.rank).toBe(DEMO_FEATURE.recommendation?.rank);
    expect(first.predicted_preference.mean).toBe(DEMO_FEATURE.recommendation?.mean);
    expect(SAMPLE_MATCH.recommendations.dataset.measurements).toBe(DEMO_FEATURE.recommendation?.of);
    // The card shows the catalogue's photograph: the same pixels as the cutout.
    expect(first.image?.path).toBe("truthear-nova.webp");
    expect(SAMPLE_MATCH.me.profile.display_name).toBe("Sample listener");
  });
});

describe("the book's surfaces match its geometry", () => {
  it("paints the spine for the curve it is wrapped on", async () => {
    const { spineSection, writeSpine, SPINE_POINTS } = await import("@/components/book/binding");
    const { SPINE_TEXTURE } = await import("@/components/book/contract");
    const points = spineSection(0, boardPose(0));
    const total = writeSpine(
      points,
      new Float32Array(SPINE_POINTS * 24),
      new Float32Array(SPINE_POINTS * 16),
    );
    expect(total).toBeCloseTo(SPINE_TEXTURE.arc, 4);
    let apex = 0;
    for (let i = 1; i <= 16; i++)
      apex += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    expect(apex / total).toBeCloseTo(SPINE_TEXTURE.apex, 3);
  });

  it("prints specifications only beside photographs whose page it took them from", async () => {
    const { SPECS } = await import("@/components/book/edition");
    for (const id of Object.keys(SPECS) as (keyof typeof IMAGES)[]) {
      expect(IMAGES[id].source.pageUrl).toMatch(/^https:\/\//);
      expect(SPECS[id]!.rows.length).toBeGreaterThan(0);
    }
  });
});
