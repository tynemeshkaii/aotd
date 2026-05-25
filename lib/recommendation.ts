export interface SelectionReasonV1 {
  is_fallback: boolean;
  primary_source_artist?: string | null;
  secondary_source_artists?: string[];
  decade?: string | null;
  lastfm_listeners?: number | null;
  lastfm_playcount?: number | null;
  spotify_related_used?: boolean;
  audio_match_used?: boolean;
  message?: string;
  fallback_reason?: string;
}

export function formatSelectionReason(r: SelectionReasonV1): string {
  if (r.is_fallback) {
    return r.message ?? "Today's a special pick — your usual flow returns tomorrow.";
  }
  const primary = r.primary_source_artist;
  const secondary = r.secondary_source_artists ?? [];
  if (!primary) return 'Based on your library. We hope you like it.';
  if (secondary.length === 0) {
    return `Picked because you've been saving stuff by ${primary} and similar artists.`;
  }
  const list = [primary, ...secondary.slice(0, 1)].join(', ');
  return `Picked because you've been saving stuff by ${list} and similar artists. We hope you like it.`;
}

export type TodayPick = {
  aotd_id: string;
  pick_date: string;
  status: 'pending' | 'opened' | 'rated';
  is_fallback: boolean;
  fallback_reason: string | null;
  selection_reason: SelectionReasonV1;
  opened_at: string | null;
  album_id: string;
  album_title: string;
  album_primary_artist_name: string;
  album_cover_url: string | null;
  album_spotify_id: string;
  album_release_year: number | null;
  album_total_tracks: number | null;
  album_duration_ms: number | null;
};
