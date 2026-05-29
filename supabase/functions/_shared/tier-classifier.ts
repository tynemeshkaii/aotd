import type { AlbumCandidate } from './candidate-generation.ts';
import { normalizeArtistName } from './external-cache.ts';
import type { PopularityBucket } from './popularity-bucket.ts';

export type CandidateTier =
  | 'known_artist_new_album'
  | 'adjacent_artist'
  | 'deep_discovery'
  | 'safe_anchor';

export function classifyCandidate(
  candidate: AlbumCandidate,
  userArtistFrequencies: Map<string, number>,
  bucket: PopularityBucket,
): CandidateTier {
  const artistKey = normalizeArtistName(candidate.primary_artist_name);
  const libraryFreq = userArtistFrequencies.get(artistKey) ?? 0;

  if (libraryFreq >= 2) return 'known_artist_new_album';
  if (bucket === 'mainstream') return 'safe_anchor';
  if (bucket === 'deep' && candidate.best_similarity_match >= 0.6) return 'deep_discovery';

  return 'adjacent_artist';
}
