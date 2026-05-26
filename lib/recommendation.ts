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

export type RatingScore = 1 | 2 | 3 | 4 | 5;
export type AotdStatus = 'pending' | 'opened' | 'rated';

export type AlbumDiscovery = {
  aotd_id: string;
  pick_date: string;
  status: AotdStatus;
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
  rating_id: string | null;
  rating_score: RatingScore | null;
  rating_comment: string | null;
  rating_created_at: string | null;
  rating_updated_at: string | null;
};

export const RATING_OPTIONS: { score: RatingScore; label: string }[] = [
  { score: 5, label: 'Loved it' },
  { score: 4, label: 'Liked it' },
  { score: 3, label: 'It was alright' },
  { score: 2, label: 'Not for me' },
  { score: 1, label: 'Bad' },
];

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

export function formatAlbumDuration(durationMs: number | null): string | null {
  if (!durationMs) return null;
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function spotifyAlbumUri(spotifyId: string): string {
  return `spotify:album:${spotifyId}`;
}

export function spotifyAlbumUrl(spotifyId: string): string {
  return `https://open.spotify.com/album/${spotifyId}`;
}

export function getRatingLabel(score: RatingScore | null): string | null {
  if (!score) return null;
  return RATING_OPTIONS.find((option) => option.score === score)?.label ?? null;
}

export function getDiscoveryStatusLabel(row: AlbumDiscovery): string {
  if (row.rating_score) return getRatingLabel(row.rating_score) ?? 'Rated';
  if (row.status === 'rated') return 'Rated';
  if (row.status === 'opened') return 'Opened';
  return 'Pending';
}

export type TodayPick = AlbumDiscovery;
