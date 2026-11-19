import { describe, expect, it } from "vitest";
import { canonicalUrl, parseMusicLink, parseYouTubeLink, splitLinks } from "./youtube";

const VIDEO = "5NV6Rdv1a3I";
const LIST = "PLT3ccL9Gu5yorlbETXH5gJGVGpcAGjmPm";

describe("parseYouTubeLink", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO}`,
    `youtube.com/watch?v=${VIDEO}&t=10`,
    `https://youtu.be/${VIDEO}?si=abc`,
    `https://music.youtube.com/watch?v=${VIDEO}`,
    `https://www.youtube.com/shorts/${VIDEO}`,
  ])("accepts video link %s", (url) => {
    expect(parseYouTubeLink(url)).toMatchObject({ ok: true, kind: "video", id: VIDEO });
  });

  it("accepts playlists", () => {
    expect(parseYouTubeLink(`https://www.youtube.com/playlist?list=${LIST}`)).toMatchObject({
      ok: true,
      kind: "playlist",
      id: LIST,
    });
  });

  it("keeps the playlist a video was opened from", () => {
    const parsed = parseYouTubeLink(`https://www.youtube.com/watch?v=${VIDEO}&list=${LIST}`);
    expect(parsed).toMatchObject({ ok: true, playlistHint: LIST });
  });

  it("ignores auto-generated mix lists", () => {
    const parsed = parseYouTubeLink(`https://www.youtube.com/watch?v=${VIDEO}&list=RD${VIDEO}`);
    expect(parsed).toMatchObject({ ok: true, playlistHint: undefined });
  });

  it.each([
    ["https://vimeo.com/1", "Only YouTube"],
    ["https://youtube.com.evil.example/watch?v=5NV6Rdv1a3I", "Only YouTube"],
    ["https://www.youtube.com/watch?v=short", "Malformed"],
    ["https://www.youtube.com/playlist?list=WL", "Account-only"],
    ["https://www.youtube.com/playlist?list=RDxyz", "mixes"],
    ["https://www.youtube.com/@artist", "Channels"],
    ["ftp://youtube.com/watch?v=5NV6Rdv1a3I", "Only YouTube"],
  ])("rejects %s", (url, message) => {
    const parsed = parseYouTubeLink(url);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain(message);
  });
});

describe("splitLinks", () => {
  it("splits on whitespace and commas", () => {
    expect(splitLinks(" a \n b, c\t\td ")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("canonicalUrl", () => {
  it("builds canonical URLs", () => {
    expect(canonicalUrl({ kind: "video", id: VIDEO })).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
    expect(canonicalUrl({ kind: "playlist", id: LIST })).toBe(
      `https://www.youtube.com/playlist?list=${LIST}`,
    );
  });
});

const SP = "37i9dQZF1DXcBWIGoYBM5M";

describe("parseMusicLink", () => {
  it.each([
    `https://open.spotify.com/playlist/${SP}`,
    `https://open.spotify.com/playlist/${SP}?si=1a2b3c4d`,
    `open.spotify.com/playlist/${SP}`,
    `https://open.spotify.com/intl-de/playlist/${SP}`,
    `spotify:playlist:${SP}`,
  ])("accepts Spotify playlist %s", (url) => {
    expect(parseMusicLink(url)).toMatchObject({ ok: true, kind: "spotify_playlist", id: SP });
  });

  it.each([
    `https://open.spotify.com/album/${SP}`,
    `https://open.spotify.com/track/${SP}`,
    "https://open.spotify.com/playlist/short",
  ])("rejects %s", (url) => {
    expect(parseMusicLink(url)).toMatchObject({ ok: false });
  });

  it("still routes YouTube links to the YouTube parser", () => {
    expect(parseMusicLink(`https://youtu.be/${VIDEO}`)).toMatchObject({ ok: true, kind: "video" });
    expect(parseMusicLink("https://vimeo.com/1")).toMatchObject({
      ok: false,
      message: "Only YouTube links work",
    });
  });

  it("builds the canonical Spotify url", () => {
    expect(canonicalUrl({ kind: "spotify_playlist", id: SP })).toBe(
      `https://open.spotify.com/playlist/${SP}`,
    );
  });
});
