export type PopularityBucket = 'unknown' | 'deep' | 'niche' | 'known' | 'mainstream';

export function popularityBucket(listeners: number | null | undefined): PopularityBucket {
  if (listeners == null) return 'unknown';
  if (listeners < 10_000) return 'deep';
  if (listeners < 100_000) return 'niche';
  if (listeners < 1_000_000) return 'known';
  return 'mainstream';
}

export interface PopularityProfile {
  p25: number;
  p50: number;
  p75: number;
}

export function popularityBucketRelative(
  listeners: number | null | undefined,
  profile: PopularityProfile | null | undefined,
): PopularityBucket {
  if (listeners == null || !profile) return popularityBucket(listeners);
  if (listeners <= profile.p25) return 'deep';
  if (listeners <= profile.p50) return 'niche';
  if (listeners <= profile.p75) return 'known';
  return 'mainstream';
}

export function computePoolRelativeProfile(
  listeners: (number | null | undefined)[],
  minSampleSize = 5,
): PopularityProfile | null {
  const valid = listeners
    .map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null))
    .filter((v): v is number => v !== null && v >= 0);
  if (valid.length < minSampleSize) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  return {
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
  };
}

function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}
