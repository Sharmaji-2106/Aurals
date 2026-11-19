"use client";

/**
 * Warming an image-sequence film before it is needed.
 *
 * A transition can't wait on the network: by the time someone presses the
 * button, its frames should already be in the browser's cache. This fetches the
 * manifest and every frame a few at a time, holding the images so they stay
 * decoded, and remembers whether the film exists at all — so a caller can
 * choose a different transition when it doesn't.
 */

type Entry = { available: boolean | null; images: HTMLImageElement[]; job: Promise<boolean> };

const films = new Map<string, Entry>();

export function prefetchFilm(src: string, parallel = 4): Promise<boolean> {
  const existing = films.get(src);
  if (existing) return existing.job;
  const entry: Entry = { available: null, images: [], job: Promise.resolve(false) };
  entry.job = (async () => {
    try {
      const res = await fetch(`${src}/manifest.json`, { cache: "force-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const m = (await res.json()) as { count: number; ext: string; digits: number };
      entry.available = true;
      let next = 0;
      const one = async (): Promise<void> => {
        while (next < m.count) {
          const i = next++;
          const img = new Image();
          img.decoding = "async";
          img.src = `${src}/frames/${String(i + 1).padStart(m.digits, "0")}.${m.ext}`;
          entry.images[i] = img;
          await img.decode().catch(() => undefined);
        }
      };
      await Promise.all(Array.from({ length: parallel }, one));
      return true;
    } catch {
      entry.available = false;
      return false;
    }
  })();
  films.set(src, entry);
  return entry.job;
}

/** Whether `src` is known to exist: null until its manifest has been asked for. */
export function filmAvailable(src: string): boolean | null {
  return films.get(src)?.available ?? null;
}
