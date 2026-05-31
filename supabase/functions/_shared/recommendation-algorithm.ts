import type { AlbumCandidate } from './candidate-generation.ts';
import { normalizeArtistName } from './external-cache.ts';
import {
  type PopularityBucket,
  type PopularityProfile,
  popularityBucket,
  popularityBucketRelative,
} from './popularity-bucket.ts';
import type { TasteSignal } from './taste-extraction.ts';
import { type CandidateTier, classifyCandidate } from './tier-classifier.ts';

export const ALGORITHM_VERSION = 2;

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
  candidate_tier?: CandidateTier;
  popularity_bucket?: PopularityBucket;
  track_b_multipliers?: {
    mainstream_penalty: number;
    known_artist_bonus: number;
    deep_discovery_bonus: number;
    source_repeat_penalty: number;
  };
}

/**
 * Fix 1 — source-artist diversity. A candidate's "dominant source artist" is the
 * library artist (one of the user's top artists) whose similar-artist graph led to
 * this candidate, with the highest library frequency. Mirrors `buildSelectionReason`'s
 * `primary_source_artist`, so the penalty targets exactly the artist shown to the user
 * as "Picked because you've been saving stuff by X".
 */
export function dominantSourceArtist(c: AlbumCandidate): string | null {
  if (c.source_paths.length === 0) return null;
  let best = c.source_paths[0];
  for (const p of c.source_paths) {
    if (p.source_artist.frequency > best.source_artist.frequency) best = p;
  }
  return best.source_artist.name;
}

/**
 * Multiplier applied to a candidate whose dominant source artist already drove a
 * recent pick. Strong (not a hard exclude) so a starved candidate pool degrades
 * gracefully into "less repetition" instead of dropping to curated fallback.
 */
export const SOURCE_REPEAT_PENALTY = 0.15;

export function scoreCandidates(
  candidates: AlbumCandidate[],
  taste: TasteSignal,
  rng: () => number = Math.random,
  weights = DEFAULT_WEIGHTS,
  popularityProfile?: PopularityProfile | null,
  recentSourceArtists: Set<string> = new Set(),
): ScoredCandidate[] {
  if (candidates.length === 0) return [];
  const userArtistFrequencies = buildUserArtistFrequencies(taste);
  const normalizedRecentSources = new Set(
    [...recentSourceArtists].map((name) => normalizeArtistName(name)),
  );

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

  const bucketFn = popularityProfile
    ? (listeners: number | null | undefined) =>
        popularityBucketRelative(listeners, popularityProfile)
    : popularityBucket;

  return candidates
    .map((c, i) => {
      const similarity = clamp01(c.best_similarity_match);
      const source_freq = candFreq[i] / maxFreq;
      const popularity = popularityPercentile(logPopularity[i]);
      const balance = releaseBalanceScore(c, taste);
      const temperature = rng();

      const baseScore =
        weights.artist_similarity * similarity +
        weights.source_artist_frequency * source_freq +
        weights.popularity_log_percentile * popularity +
        weights.release_balance * balance +
        weights.sampling_temperature * temperature;
      const bucket = bucketFn(c.lastfm_listeners);
      const tier = classifyCandidate(c, userArtistFrequencies, bucket);
      const adjusted = applyTrackBScore(baseScore, tier, bucket);

      // Fix 1 — penalize candidates whose dominant source artist drove a recent pick.
      const domSource = dominantSourceArtist(c);
      const sourceRepeatPenalty =
        domSource && normalizedRecentSources.has(normalizeArtistName(domSource))
          ? SOURCE_REPEAT_PENALTY
          : 1;
      const finalScore = adjusted.score * sourceRepeatPenalty;

      return {
        candidate: c,
        score: finalScore,
        breakdown: { similarity, source_freq, popularity, balance, temperature },
        candidate_tier: tier,
        popularity_bucket: bucket,
        track_b_multipliers: {
          ...adjusted.multipliers,
          source_repeat_penalty: sourceRepeatPenalty,
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function applyTrackBScore(baseScore: number, tier: CandidateTier, bucket: PopularityBucket) {
  const multipliers = {
    mainstream_penalty: 1,
    known_artist_bonus: 1,
    deep_discovery_bonus: 1,
  };
  let score = baseScore;

  if (bucket === 'mainstream' && tier === 'adjacent_artist') {
    multipliers.mainstream_penalty = 0.4;
    score *= multipliers.mainstream_penalty;
  }
  if (tier === 'known_artist_new_album') {
    multipliers.known_artist_bonus = 1.25;
    score *= multipliers.known_artist_bonus;
  }
  if (tier === 'deep_discovery') {
    multipliers.deep_discovery_bonus = 1.1;
    score *= multipliers.deep_discovery_bonus;
  }

  return { score, multipliers };
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

function buildUserArtistFrequencies(taste: TasteSignal) {
  const out = new Map<string, number>();
  for (const artist of taste.topArtists) {
    const key = normalizeArtistName(artist.name);
    out.set(key, (out.get(key) ?? 0) + artist.frequency);
  }
  return out;
}

export function selectFromTop(
  scored: ScoredCandidate[],
  rng: () => number = Math.random,
  topN = 20,
  maxPerSourceArtist?: number,
): ScoredCandidate | null {
  if (scored.length === 0) return null;
  const top = buildTopPool(scored, topN, maxPerSourceArtist);
  const total = top.reduce((s, x) => s + Math.max(0, x.score), 0);
  if (total <= 0) return top[Math.floor(rng() * top.length)];
  let r = rng() * total;
  for (const item of top) {
    r -= Math.max(0, item.score);
    if (r <= 0) return item;
  }
  return top[top.length - 1];
}

/**
 * Fix 2 — build the top-N sampling pool while capping how many candidates a single
 * dominant source artist may contribute. `scored` is already sorted desc, so we walk
 * it greedily and skip a candidate once its source artist hit the cap. This breaks the
 * "one source artist owns most of the pool" monoculture even when the candidate cache
 * is skewed. When `maxPerSourceArtist` is unset, behaves like the old plain top-N slice.
 */
function buildTopPool(
  scored: ScoredCandidate[],
  topN: number,
  maxPerSourceArtist?: number,
): ScoredCandidate[] {
  if (!maxPerSourceArtist || maxPerSourceArtist <= 0) {
    return scored.slice(0, Math.min(topN, scored.length));
  }
  const counts = new Map<string, number>();
  const capped: ScoredCandidate[] = [];
  for (const item of scored) {
    if (capped.length >= topN) break;
    const dom = dominantSourceArtist(item.candidate);
    const key = dom ? normalizeArtistName(dom) : '';
    if (key) {
      const n = counts.get(key) ?? 0;
      if (n >= maxPerSourceArtist) continue;
      counts.set(key, n + 1);
    }
    capped.push(item);
  }
  // Safety: if the cap starved the pool (e.g. every candidate shares one source
  // artist), fall back to a plain top-N slice so we never return an empty pool.
  if (capped.length === 0) {
    return scored.slice(0, Math.min(topN, scored.length));
  }
  return capped;
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
    candidate_tier: chosen.candidate_tier ?? null,
    popularity_bucket: chosen.popularity_bucket ?? null,
    source_artist_count: chosen.candidate.source_paths.length,
    track_b_multipliers: chosen.track_b_multipliers ?? null,
  };
}
