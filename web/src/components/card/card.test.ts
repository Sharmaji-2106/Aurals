import { CARD_SECONDS } from "@/components/book/contract";
import { commission, FINISH_IDS, rankFinishes } from "@/components/card/commission";
import { LISTENERS, library } from "@/components/card/listener";
import { signature, traits } from "@/components/card/reading";
import { phases } from "@/components/card/reveal";
import { describe, expect, it } from "vitest";

async function all() {
  return Promise.all(
    LISTENERS.map(async (entry) => {
      const lib = library(entry, await entry.load());
      return { entry, lib, art: commission(lib) };
    }),
  );
}

describe("the Sound Card is drawn from the library, not invented", () => {
  it("reads every track onto the map with its measured axes", async () => {
    for (const { lib } of await all()) {
      expect(lib.tracks.length).toBeGreaterThan(0);
      for (const t of lib.tracks) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThanOrEqual(1);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeLessThanOrEqual(1);
      }
      // The coordinates printed on the card are the library's own medians.
      expect(lib.coordinates.x).toBe(lib.descriptors.brightness.median);
      expect(lib.coordinates.y).toBe(lib.descriptors.energy.median);
    }
  });

  it("names regions by the artist who appears most in them", async () => {
    for (const { lib } of await all()) {
      for (const region of lib.regions) {
        if (!region.anchor) continue;
        const members = lib.tracks.filter((t) => t.cluster === region.id && !t.outlier);
        const count = members.filter((t) => t.channel === region.anchor!.name).length;
        expect(count).toBe(region.anchor.count);
        for (const name of new Set(members.map((t) => t.channel))) {
          expect(members.filter((t) => t.channel === name).length).toBeLessThanOrEqual(count);
        }
      }
    }
  });

  it("explains every art direction with a measured reason", async () => {
    for (const { art } of await all()) {
      expect(art.colophon.length).toBeGreaterThan(3);
      for (const line of art.colophon) expect(line.because).toMatch(/\d/);
    }
  });
});

describe("the lineup test", () => {
  it("gives four contrasting libraries four different finishes", async () => {
    const made = await all();
    expect(new Set(made.map(({ art }) => art.family)).size).toBe(made.length);
    expect(new Set(made.map(({ art }) => art.material)).size).toBeGreaterThan(2);
    expect(new Set(made.map(({ art }) => art.type.engrave)).size).toBe(made.length);
  });

  it("offers every finish, and a chosen finish says it was chosen", async () => {
    const [{ lib }] = await all();
    expect(FINISH_IDS.length).toBeGreaterThanOrEqual(12);
    for (const id of FINISH_IDS) {
      const art = commission(lib, id);
      expect(art.family).toBe(id);
      expect(art.colophon[0].because).toMatch(/\d|picked over/);
    }
    const other = FINISH_IDS.find((id) => id !== rankFinishes(lib)[0])!;
    expect(commission(lib, other).colophon[0].decision).toContain("chosen by the listener");
  });
});

describe("the reading is drawn from measurements", () => {
  it("names at most three traits, each from a measured value", async () => {
    for (const { lib } of await all()) {
      const found = traits(lib);
      expect(found.length).toBeGreaterThan(0);
      expect(found.length).toBeLessThanOrEqual(3);
      for (const t of found) {
        if (t.key === "balanced") continue;
        if (t.key === "loudness") expect(lib.measures.integrated_lufs).toBeDefined();
        else expect(Math.abs(lib.descriptors[t.key].median - 0.5)).toBeGreaterThanOrEqual(0.05);
      }
    }
  });

  it("draws the line from the sound profile's six tonal dimensions", async () => {
    for (const { lib } of await all()) {
      const sig = signature(lib);
      expect(sig.values).toHaveLength(6);
      for (const v of sig.values) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("the reveal", () => {
  it("is short, and fits the sample listener's card into the edition's timeline", () => {
    expect(phases().total).toBeLessThanOrEqual(3);
    expect(phases().total).toBeLessThanOrEqual(CARD_SECONDS);
  });

  it("runs its acts in order", () => {
    const p = phases();
    expect(p.arrive[0]).toBeLessThan(p.scan[0]);
    expect(p.scan[1]).toBeLessThan(p.shine[1]);
    expect(p.shine[1]).toBeLessThanOrEqual(p.total);
  });
});
