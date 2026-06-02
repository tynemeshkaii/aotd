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
  issue_number: number;
  pick_date: string;
  status: AotdStatus;
  is_fallback: boolean;
  fallback_reason: string | null;
  selection_reason: SelectionReasonV1;
  opened_at: string | null;
  album_id: string;
  album_title: string;
  album_primary_artist_name: string;
  album_artist_country: string | null;
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

export function formatArtistCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return (
    {
      GB: 'UK',
    }[normalized] ?? normalized
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

function isAotdStatus(value: unknown): value is AotdStatus {
  return value === 'pending' || value === 'opened' || value === 'rated';
}

function isRatingScore(value: unknown): value is RatingScore {
  return value === null || value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function isAlbumDiscovery(value: unknown): value is AlbumDiscovery {
  if (!isRecord(value)) return false;

  return (
    typeof value.aotd_id === 'string' &&
    typeof value.issue_number === 'number' &&
    typeof value.pick_date === 'string' &&
    isAotdStatus(value.status) &&
    typeof value.is_fallback === 'boolean' &&
    isNullableString(value.fallback_reason) &&
    isRecord(value.selection_reason) &&
    isNullableString(value.opened_at) &&
    typeof value.album_id === 'string' &&
    typeof value.album_title === 'string' &&
    typeof value.album_primary_artist_name === 'string' &&
    isNullableString(value.album_artist_country) &&
    isNullableString(value.album_cover_url) &&
    typeof value.album_spotify_id === 'string' &&
    isNullableNumber(value.album_release_year) &&
    isNullableNumber(value.album_total_tracks) &&
    isNullableNumber(value.album_duration_ms) &&
    isNullableString(value.rating_id) &&
    isRatingScore(value.rating_score) &&
    isNullableString(value.rating_comment) &&
    isNullableString(value.rating_created_at) &&
    isNullableString(value.rating_updated_at)
  );
}

export function parseAlbumDiscovery(value: unknown): AlbumDiscovery {
  if (!isAlbumDiscovery(value)) {
    throw new Error('invalid_album_discovery_shape');
  }

  return value;
}

export function parseAlbumDiscoveries(value: unknown): AlbumDiscovery[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_album_discoveries_shape');
  }

  return value.map(parseAlbumDiscovery);
}
