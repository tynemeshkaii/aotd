export type ReleaseEligibilityInput = {
  album_type?: string | null;
  total_tracks?: number | null;
  duration_ms?: number | null;
};

export const MIN_RECOMMENDATION_TRACKS = 3;
export const MIN_RECOMMENDATION_DURATION_MS = 10 * 60 * 1000;

export function isRecommendationReleaseLike(release: ReleaseEligibilityInput): boolean {
  const albumType = release.album_type?.toLowerCase().trim() ?? null;
  const tracks = normalizeCount(release.total_tracks);
  const durationMs = normalizeCount(release.duration_ms);

  if (albumType === 'compilation') return false;
  if (tracks !== null && tracks <= 1) return false;

  if (albumType === 'single') {
    return (
      (tracks !== null && tracks >= MIN_RECOMMENDATION_TRACKS) ||
      (durationMs !== null && durationMs >= MIN_RECOMMENDATION_DURATION_MS)
    );
  }

  if (tracks !== null) return tracks >= MIN_RECOMMENDATION_TRACKS;
  if (durationMs !== null) return durationMs >= MIN_RECOMMENDATION_DURATION_MS;

  return albumType === 'album';
}

function normalizeCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
