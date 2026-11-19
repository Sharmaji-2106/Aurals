/**
 * Client-side mirror of the backend URL parsers (`music/urls.py`, `music/spotify.py`),
 * used only for instant feedback while typing. The server re-validates everything.
 */
export type LinkKind = "video" | "playlist" | "spotify_playlist";

export type ParsedLink =
  | { ok: true; kind: "video" | "playlist"; id: string; playlistHint?: string; raw: string }
  | { ok: true; kind: "spotify_playlist"; id: string; raw: string }
  | { ok: false; raw: string; message: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);
const SPOTIFY_HOSTS = new Set(["open.spotify.com", "play.spotify.com", "www.open.spotify.com"]);
const SPOTIFY_ID = /^[A-Za-z0-9]{16,40}$/;
const PRIVATE_LISTS = new Set(["WL", "LL", "LM"]);

function fail(raw: string, message: string): ParsedLink {
  return { ok: false, raw, message };
}

export function parseYouTubeLink(input: string): ParsedLink {
  const raw = input.trim();
  if (!raw) return fail(raw, "Empty link");
  if (raw.length > 2048) return fail(raw, "That link is too long");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return fail(raw, "Not a valid link");
  }
  if (!["http:", "https:"].includes(url.protocol)) return fail(raw, "Only YouTube links work");
  if (url.username || url.password || (url.port && !["80", "443"].includes(url.port))) {
    return fail(raw, "Only YouTube links work");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const segments = url.pathname.split("/").filter(Boolean);
  const list = url.searchParams.get("list");

  let videoId: string | null = null;
  if (SHORT_HOSTS.has(host)) {
    videoId = segments[0] ?? null;
  } else if (HOSTS.has(host)) {
    if (segments[0] === "watch" || (segments.length === 0 && url.searchParams.get("v"))) {
      videoId = url.searchParams.get("v");
    } else if (segments[0] === "playlist") {
      if (!list) return fail(raw, "This playlist link has no id");
      if (PRIVATE_LISTS.has(list)) return fail(raw, "Account-only list: share a public copy");
      if (list.startsWith("RD")) return fail(raw, "Auto-generated mixes aren't supported");
      if (!PLAYLIST_ID.test(list)) return fail(raw, "Malformed playlist link");
      return { ok: true, kind: "playlist", id: list, raw };
    } else if (segments.length >= 2 && ["shorts", "live", "embed", "v", "e"].includes(segments[0])) {
      videoId = segments[1];
    } else if (segments[0]?.startsWith("@") || ["channel", "c", "user"].includes(segments[0] ?? "")) {
      return fail(raw, "Channels aren't supported yet");
    } else {
      return fail(raw, "Paste a video or playlist link");
    }
  } else {
    return fail(raw, "Only YouTube links work");
  }

  if (!videoId || !VIDEO_ID.test(videoId)) return fail(raw, "Malformed video link");
  const hint =
    list && PLAYLIST_ID.test(list) && !PRIVATE_LISTS.has(list) && !list.startsWith("RD") ? list : undefined;
  return { ok: true, kind: "video", id: videoId, playlistHint: hint, raw };
}

export function parseSpotifyLink(input: string): ParsedLink {
  const raw = input.trim();
  if (!raw) return fail(raw, "Empty link");
  if (raw.length > 2048) return fail(raw, "That link is too long");

  // The desktop app copies links as spotify:playlist:<id>.
  if (raw.toLowerCase().startsWith("spotify:")) {
    const parts = raw.split(":");
    if (parts.length === 3 && parts[1].toLowerCase() === "playlist" && SPOTIFY_ID.test(parts[2])) {
      return { ok: true, kind: "spotify_playlist", id: parts[2], raw };
    }
    return fail(raw, "Only Spotify playlists work here");
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return fail(raw, "Not a valid link");
  }
  if (!["http:", "https:"].includes(url.protocol)) return fail(raw, "Only Spotify links work");
  if (url.username || url.password || (url.port && !["80", "443"].includes(url.port))) {
    return fail(raw, "Only Spotify links work");
  }
  let segments = url.pathname.split("/").filter(Boolean);
  // Localised links carry a country prefix: /intl-de/playlist/<id>.
  if (segments[0]?.startsWith("intl-")) segments = segments.slice(1);
  if (segments[0] === "playlist") {
    if (!segments[1] || !SPOTIFY_ID.test(segments[1])) return fail(raw, "Malformed playlist link");
    return { ok: true, kind: "spotify_playlist", id: segments[1], raw };
  }
  if (["album", "track", "artist", "show", "episode", "user"].includes(segments[0] ?? "")) {
    return fail(raw, `Spotify ${segments[0]} links aren't supported yet`);
  }
  return fail(raw, "Paste a Spotify playlist link");
}

function looksLikeSpotify(input: string) {
  const raw = input.trim();
  if (raw.toLowerCase().startsWith("spotify:")) return true;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return SPOTIFY_HOSTS.has(new URL(withScheme).hostname.toLowerCase().replace(/\.$/, ""));
  } catch {
    return false;
  }
}

/** Route a pasted link to the parser that owns it, as the server does. */
export function parseMusicLink(input: string): ParsedLink {
  return looksLikeSpotify(input) ? parseSpotifyLink(input) : parseYouTubeLink(input);
}

/** Split pasted text into candidate links (newlines, spaces, commas). */
export function splitLinks(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canonicalUrl(link: { kind: LinkKind; id: string }) {
  if (link.kind === "spotify_playlist") return `https://open.spotify.com/playlist/${link.id}`;
  return link.kind === "video"
    ? `https://www.youtube.com/watch?v=${link.id}`
    : `https://www.youtube.com/playlist?list=${link.id}`;
}

export function thumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
