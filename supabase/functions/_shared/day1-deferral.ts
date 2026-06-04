export type NonPersonalFallbackReason =
  | 'compute_timeout'
  | 'no_candidates'
  | 'spotify_search_failed'
  | 'spotify_audio_unavailable'
  | 'lastfm_unavailable'
  | 'mb_timeout'
  | 'library_too_small'
  | 'unknown_error';

export const DAY1_LIBRARY_COUNT_THRESHOLD = 10;

export type Day1DeferDecision = { defer: true; reason: string } | { defer: false };

const REASON_TO_DEFER_KEY: Partial<Record<NonPersonalFallbackReason, string>> = {
  compute_timeout: 'day1_compute_timeout',
  no_candidates: 'day1_no_candidates',
  spotify_search_failed: 'day1_spotify_search_failed',
  spotify_audio_unavailable: 'day1_spotify_audio_unavailable',
  lastfm_unavailable: 'day1_lastfm_unavailable',
  mb_timeout: 'day1_mb_timeout',
  library_too_small: 'day1_library_quality_issue',
  unknown_error: 'day1_unknown_error',
};

export type ShouldDeferFirstPickInput = {
  fallbackReason: string | null;
  existingPicks: number;
  aggregatedAlbumsCount: number;
  libraryCountThreshold?: number;
};

export function shouldDeferFirstPick(input: ShouldDeferFirstPickInput): Day1DeferDecision {
  const threshold = input.libraryCountThreshold ?? DAY1_LIBRARY_COUNT_THRESHOLD;
  const reason = input.fallbackReason;

  if (input.existingPicks > 0) return { defer: false };
  if (input.aggregatedAlbumsCount < threshold) return { defer: false };

  if (reason === null) return { defer: false };
  const deferKey = REASON_TO_DEFER_KEY[reason as NonPersonalFallbackReason];
  if (!deferKey) return { defer: false };

  return { defer: true, reason: deferKey };
}

export function isNonPersonalFallbackReason(value: unknown): value is NonPersonalFallbackReason {
  return typeof value === 'string' && value in REASON_TO_DEFER_KEY;
}
