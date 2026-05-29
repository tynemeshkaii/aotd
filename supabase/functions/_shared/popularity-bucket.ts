export type PopularityBucket = 'unknown' | 'deep' | 'niche' | 'known' | 'mainstream';

export function popularityBucket(listeners: number | null | undefined): PopularityBucket {
  if (listeners == null) return 'unknown';
  if (listeners < 10_000) return 'deep';
  if (listeners < 100_000) return 'niche';
  if (listeners < 1_000_000) return 'known';
  return 'mainstream';
}
