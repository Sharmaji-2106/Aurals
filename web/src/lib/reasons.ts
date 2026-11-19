/** Human wording for track skip / failure codes produced by the pipeline. */
const REASONS: Record<string, string> = {
  private: "Private video",
  unavailable: "No longer available",
  age_restricted: "Age-restricted",
  geo_blocked: "Not available in the analysis region",
  members_only: "Members-only",
  live: "Live stream",
  not_yet_available: "Not released yet",
  too_short: "Too short to analyse",
  too_long: "Too long (mixes aren't supported yet)",
  too_large: "File too large",
  silent: "Silent audio",
  decode_failed: "Audio couldn't be decoded",
  duplicate: "Duplicate of another track",
  altered_version: "Altered upload (sped up, slowed, boosted)",
  sampled_out: "Not needed for a representative sample",
  processing_failed: "Processing failed",
};

export function reasonLabel(code: string | null | undefined) {
  if (!code) return "";
  return REASONS[code] ?? code.replaceAll("_", " ");
}

const SOURCE_ERRORS: Record<string, string> = {
  playlist_not_found: "Playlist not found or private",
  unavailable: "Video unavailable",
  private: "Private video",
  network: "YouTube didn't respond",
  bot_check: "YouTube asked us to slow down",
  rate_limited: "YouTube asked us to slow down",
  spotify_not_found: "Playlist is private or no longer exists",
  spotify_empty: "No readable tracks in that playlist",
  spotify_no_matches: "None of those songs could be found on YouTube",
  spotify_not_playlist: "That Spotify link isn't a playlist",
  spotify_unavailable: "Spotify didn't respond",
  spotify_shape: "Spotify changed its page; we couldn't read the playlist",
};

export function sourceErrorLabel(code: string | null | undefined) {
  if (!code) return "";
  return SOURCE_ERRORS[code] ?? reasonLabel(code);
}
