import type { AlbumCandidate } from './candidate-generation.ts';
import type { TasteSignal } from './taste-extraction.ts';

export const ALGORITHM_VERSION = 1;

export interface ScoringWeights {
  artist_similarity: number;
  source_artist_frequency: number;
  popularity_log_percentile: number;
  release_balance: number;
  sampling_temperature: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  artist_similarity: 0.45,
  source_artist_frequency: 0.2,
  popularity_log_percentile: 0.2,
  release_balance: 0.05,
  sampling_temperature: 0.1,
};

export interface ScoredCandidate {
  candidate: AlbumCandidate;
  score: number;
  breakdown: {
    similarity: number;
    source_freq: number;
    popularity: number;
    balance: number;
    temperature: number;
  };
}

export function scoreCandidates(
  candidates: AlbumCandidate[],
  taste: TasteSignal,
  rng: () => number = Math.random,
  weights = DEFAULT_WEIGHTS,
): ScoredCandidate[] {
  if (candidates.length === 0) return [];

  const popularityMetrics = candidates.map((c) => c.lastfm_listeners ?? c.lastfm_playcount ?? 0);
  const logPopularity = popularityMetrics.map((v) => Math.log(v + 1));
  const sortedLog = [...logPopularity].sort((a, b) => a - b);
  const popularityPercentile = (v: number) => {
    if (sortedLog.length === 0) return 0;
    let idx = sortedLog.findIndex((x) => x >= v);
    if (idx < 0) idx = sortedLog.length - 1;
    return idx / Math.max(1, sortedLog.length - 1);
  };

  const candFreq = candidates.map((c) =>
    c.source_paths.reduce((s, p) => s + Math.log(p.source_artist.frequency + 1), 0),
  );
  const maxFreq = Math.max(1, ...candFreq);

  return candidates
    .map((c, i) => {
      const similarity = clamp01(c.best_similarity_match);
      const source_freq = candFreq[i] / maxFreq;
      const popularity = popularityPercentile(logPopularity[i]);
      const balance = releaseBalanceScore(c, taste);
      const temperature = rng();

      const score =
        weights.artist_similarity * similarity +
        weights.source_artist_frequency * source_freq +
        weights.popularity_log_percentile * popularity +
        weights.release_balance * balance +
        weights.sampling_temperature * temperature;

      return {
        candidate: c,
        score,
        breakdown: { similarity, source_freq, popularity, balance, temperature },
      };
    })
    .sort((a, b) => b.score - a.score);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function releaseBalanceScore(c: AlbumCandidate, taste: TasteSignal): number {
  if (!c.release_year) return 0.5;
  const decade = String(Math.floor(c.release_year / 10) * 10);
  const libFraction = taste.libraryDecadeFractions[decade] ?? 0;
  return clamp01(1 - libFraction);
}

export function selectFromTop(
  scored: ScoredCandidate[],
  rng: () => number = Math.random,
  topN = 20,
): ScoredCandidate | null {
  if (scored.length === 0) return null;
  const top = scored.slice(0, Math.min(topN, scored.length));
  const total = top.reduce((s, x) => s + Math.max(0, x.score), 0);
  if (total <= 0) return top[Math.floor(rng() * top.length)];
  let r = rng() * total;
  for (const item of top) {
    r -= Math.max(0, item.score);
    if (r <= 0) return item;
  }
  return top[top.length - 1];
}

export function buildSelectionReason(
  chosen: ScoredCandidate,
  _taste: TasteSignal,
  spotifyRelatedAvailable: boolean,
  isFallback = false,
  fallbackReason: string | null = null,
): Record<string, unknown> {
  if (isFallback) {
    return {
      is_fallback: true,
      fallback_reason: fallbackReason,
      message: "Today's a special pick — your usual flow returns tomorrow.",
    };
  }
  const sortedPaths = chosen.candidate.source_paths
    .slice()
    .sort((a, b) => b.source_artist.frequency - a.source_artist.frequency);
  const primaryPath = sortedPaths[0];
  return {
    is_fallback: false,
    primary_source_artist: primaryPath?.source_artist.name ?? null,
    secondary_source_artists: sortedPaths.slice(1, 4).map((p) => p.source_artist.name),
    similar_artists_path: [chosen.candidate.primary_artist_name],
    lastfm_listeners: chosen.candidate.lastfm_listeners ?? null,
    lastfm_playcount: chosen.candidate.lastfm_playcount ?? null,
    decade: chosen.candidate.release_year
      ? `${Math.floor(chosen.candidate.release_year / 10) * 10}s`
      : null,
    spotify_related_used: spotifyRelatedAvailable,
    audio_match_used: false,
    score_breakdown: chosen.breakdown,
  };
}
