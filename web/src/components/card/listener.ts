import type { Me, MusicProfile, Recommendations, SoundProfile } from "@/lib/api/client";

/**
 * A listener, as the Sound Card, the Soundscape and the Listening Edition see
 * them: what `/match` reads (session, sound profile, music profile, ranked
 * earphones), captured from the running engine by
 * `design/book/capture_sample_match.py`. Nothing here is edited by hand.
 *
 * `Library` is what the card is drawn from — the music profile's own numbers,
 * reorganised, never interpreted into traits.
 */

export type ListenerSnapshot = {
  capturedOn: string;
  playlist: string;
  me: Me;
  sound: SoundProfile;
  music: MusicProfile;
  recommendations: Recommendations;
};

/** The signed-in listener's own card: their live data, never a prepared copy. */
export type OwnListener = {
  /** Seeds the card's edition number; not shown or encoded anywhere. */
  slug: string;
  title: string;
  /** Whether the title is a playlist's own, or the listener's name for their songs. */
  from: "playlist" | "songs" | "picks";
  snapshot: ListenerSnapshot;
};

/**
 * The signed-in listener, as the card reads them: the same four things a
 * prepared snapshot holds, taken from the live queries `/match` already makes.
 * Named after their playlist when the music came from one, otherwise after them.
 */
export function ownListener(
  me: Me,
  sound: SoundProfile,
  music: MusicProfile,
  recommendations: Recommendations,
): OwnListener {
  const playlist = music.playlist_title?.trim() || null;
  return {
    slug: `listener-${music.id}`,
    title: playlist ?? `${me.profile.display_name}’s music`,
    from: music.origin === "genre_picks" ? "picks" : playlist ? "playlist" : "songs",
    snapshot: {
      capturedOn: music.created_at,
      playlist: playlist ?? "",
      me,
      sound,
      music,
      recommendations,
    },
  };
}

/** A prepared listener: whose music, and where the playlist came from. */
export type ListenerEntry = {
  slug: string;
  /** The playlist's own title, as its page shows it. */
  title: string;
  playlistUrl: string;
  load: () => Promise<ListenerSnapshot>;
};

export type Track = {
  id: string;
  title: string;
  /** The YouTube channel it came from — usually, not always, the artist. */
  channel: string;
  /** Brightness and energy, the map's two measured axes (0–1, vs the reference corpus). */
  x: number;
  y: number;
  cluster: number;
  weight: number;
  outlier: boolean;
  /** Its long-term spectrum, in dB, at `Library.freqs`. */
  spectrum: number[];
};

export type Region = {
  id: number;
  /** The analyser's own name for it ("Darker · Warmer"). */
  label: string;
  size: number;
  share: number;
  /** The channel that appears most in it, and how often. */
  anchor: { name: string; count: number } | null;
  /** Its centre of mass on the map. */
  centre: { x: number; y: number };
  descriptors: Record<string, number>;
};

type Range = { median: number; p25: number; p75: number };

export type Library = {
  slug: string;
  title: string;
  listener: string;
  trackCount: number;
  tracks: Track[];
  regions: Region[];
  artists: { name: string; count: number }[];
  freqs: number[];
  descriptors: Record<string, Range>;
  measures: Record<string, Range & { unit: string }>;
  /** The library's long-term spectrum (median across tracks), for the Hum. */
  spectrum: { freqs: number[]; db: number[] };
  /** Where the library sits on the map: the medians of its axes. */
  coordinates: { x: number; y: number };
  top: Recommendations["items"][number] | null;
  snapshot: ListenerSnapshot;
};

type ProfileData = {
  descriptors: { key: string; value: Range }[];
  measures: { key: string; unit: string; value: Range }[];
  clusters: {
    id: number;
    label: string;
    size: number;
    share: number;
    descriptors: Record<string, number>;
  }[];
  map: { track_id: string; x: number; y: number; cluster: number; weight: number; flag: string | null }[];
  spectrum: { freqs_hz: number[]; median_db?: number[]; db?: number[]; [k: string]: unknown };
};

export function library(entry: Pick<ListenerEntry, "slug" | "title">, snapshot: ListenerSnapshot): Library {
  const music = snapshot.music as unknown as {
    data: ProfileData;
    tracks: Record<string, { title: string; channel: string }>;
    spectrum_freqs_hz: number[];
    track_spectra: Record<string, number[]>;
    track_count: number;
  };
  const data = music.data;
  const tracks: Track[] = data.map.map((point) => {
    const meta = music.tracks[point.track_id];
    return {
      id: point.track_id,
      title: meta?.title ?? "",
      channel: meta?.channel ?? "",
      x: point.x,
      y: point.y,
      cluster: point.cluster,
      weight: point.weight,
      outlier: point.flag === "outlier",
      spectrum: music.track_spectra[point.track_id] ?? [],
    };
  });

  const counts = new Map<string, number>();
  for (const t of tracks) if (t.channel) counts.set(t.channel, (counts.get(t.channel) ?? 0) + 1);
  const artists = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const regions: Region[] = data.clusters.map((c) => {
    const members = tracks.filter((t) => t.cluster === c.id && !t.outlier);
    const local = new Map<string, number>();
    for (const t of members) if (t.channel) local.set(t.channel, (local.get(t.channel) ?? 0) + 1);
    const best = [...local.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const total = members.reduce((s, t) => s + t.weight, 0) || 1;
    return {
      id: c.id,
      label: c.label,
      size: c.size,
      share: c.share,
      anchor: best ? { name: best[0], count: best[1] } : null,
      centre: {
        x: members.reduce((s, t) => s + t.x * t.weight, 0) / total,
        y: members.reduce((s, t) => s + t.y * t.weight, 0) / total,
      },
      descriptors: c.descriptors,
    };
  });

  const descriptors = Object.fromEntries(data.descriptors.map((d) => [d.key, d.value]));
  const measures = Object.fromEntries(data.measures.map((m) => [m.key, { ...m.value, unit: m.unit }]));
  const freqs = music.spectrum_freqs_hz;
  // The library's spectrum: the median of its tracks', band by band.
  const median = freqs.map((_, i) => {
    const values = tracks
      .filter((t) => !t.outlier && t.spectrum.length === freqs.length)
      .map((t) => t.spectrum[i])
      .sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : 0;
  });

  return {
    slug: entry.slug,
    title: entry.title,
    listener: snapshot.me.profile.display_name,
    trackCount: music.track_count,
    tracks,
    regions,
    artists,
    freqs,
    descriptors,
    measures,
    spectrum: { freqs, db: median },
    coordinates: { x: descriptors.brightness?.median ?? 0.5, y: descriptors.energy?.median ?? 0.5 },
    top: snapshot.recommendations.items[0] ?? null,
    snapshot,
  };
}

/**
 * The prepared listeners for the studio and the demo. Each is a real public
 * playlist analysed by the real pipeline; the snapshot says which.
 */
export const LISTENERS: ListenerEntry[] = [
  {
    slug: "neon-odyssey",
    title: "Neon Odyssey",
    playlistUrl: "https://www.youtube.com/playlist?list=PLdn4XEK2HsiwZ9C71WMtJB8GrUMT0sWh-",
    load: () =>
      import("@/components/book/sample-match.json").then((m) => m.default as unknown as ListenerSnapshot),
  },
  {
    slug: "metal-classics",
    title: "90's Metal Classics",
    playlistUrl: "https://www.youtube.com/playlist?list=PLDcxZcf5_wJEugWsP-O62jodc0iYrpg4r",
    load: () => import("./listeners/metal.json").then((m) => m.default as unknown as ListenerSnapshot),
  },
  {
    slug: "indie-folk",
    title: "Best New Indie Folk Songs",
    playlistUrl: "https://www.youtube.com/playlist?list=PLFHPLhbVbv26RJJLaKuR1FIm-EVW2frfw",
    load: () => import("./listeners/folk.json").then((m) => m.default as unknown as ListenerSnapshot),
  },
  {
    slug: "solo-piano",
    title: "Solo Piano - Classical Music",
    playlistUrl: "https://www.youtube.com/playlist?list=PLr7z7yWqxWRDVSw70dTTRMi21sJPz5sn3",
    load: () => import("./listeners/piano.json").then((m) => m.default as unknown as ListenerSnapshot),
  },
];
