import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAlbumKey } from './album-dedupe.ts';
import { ExternalApiCircuitOpenError } from './external-api-breaker.ts';
import { getLastfmSimilarCached, getSpotifyRelatedCached } from './external-cache.ts';
import { fetchAlbumInfo } from './lastfm.ts';
import { getLastfmTopAlbumsCached } from './lastfm-top-albums-cache.ts';
import { getReleaseGroupCached, isAlbumLike, type MbReleaseGroup } from './musicbrainz.ts';
import { isRecommendationReleaseLike } from './release-eligibility.ts';
import { resolveSpotifyAlbumCached } from './spotify-album-resolution-cache.ts';
import { fetchAlbumDetails } from './spotify-extended.ts';
import type { TasteSignal, UserArtist } from './taste-extraction.ts';

export interface AlbumCandidate {
  spotify_id: string;
  mb_release_group_id?: string;
  title: string;
  primary_artist_name: string;
  primary_artist_spotify_id?: string;
  cover_url?: string;
  total_tracks: number;
  duration_ms?: number;
  release_year?: number;
  album_type?: string;
  lastfm_listeners?: number;
  lastfm_playcount?: number;
  best_similarity_match: number;
  source_paths: { source_artist: UserArtist; similar_match: number }[];
}

export type DiagEvent = { at_ms: number; stage: string; detail?: Record<string, unknown> };

interface GenerateOpts {
  maxSourceArtists?: number;
  maxSimilarPerSource?: number;
  maxAlbumsPerSimilar?: number;
  maxCandidates?: number;
  maxTextArtistLookups?: number;
  spotifyResolutionTopK?: number;
  maxMusicBrainzLookups?: number;
  maxConsecutiveLastfmFailures?: number;
  maxConsecutiveSpotifySearchFailures?: number;
  deadlineAtMs?: number;
  useSpotifyRelated?: boolean;
  market?: string;
  /** Skip Last.fm album.getinfo for each accepted candidate; rely on playcount from artist.getTopAlbums. */
  skipAlbumInfoLookup?: boolean;
  /** Skip Spotify /albums/{id} detail lookup for total_tracks<6 — just reject those albums. */
  skipAlbumDetailsLookup?: boolean;
  /** Skip the post-loop MusicBrainz validation pass — caller validates the chosen candidate instead. */
  skipMusicBrainz?: boolean;
  /** Optional diagnostic sink — when provided, generateCandidates appends per-stage timings. */
  diag?: DiagEvent[];
  userId?: string;
  requestContext?: string;
}

export interface CandidateExclusions {
  spotifyAlbumIds: Set<string>;
  releaseGroupIds: Set<string>;
  normalizedAlbumKeys: Set<string>;
}

type TextCandidate = {
  candidate_artist_name: string;
  candidate_album_name: string;
  lastfm_playcount?: number;
  similarity_match: number;
  source_artist_frequency: number;
  source_paths: { source_artist: UserArtist; similar_match: number }[];
};

export class CandidateGenerationError extends Error {
  candidates: AlbumCandidate[];
  spotifyRelatedAvailable: boolean;

  constructor(message: string, candidates: AlbumCandidate[], spotifyRelatedAvailable: boolean) {
    super(message);
    this.name = 'CandidateGenerationError';
    this.candidates = candidates;
    this.spotifyRelatedAvailable = spotifyRelatedAvailable;
  }
}

const DEFAULTS: Required<Omit<GenerateOpts, 'diag' | 'userId' | 'requestContext'>> = {
  maxSourceArtists: 15,
  maxSimilarPerSource: 8,
  maxAlbumsPerSimilar: 2,
  maxCandidates: 250,
  maxTextArtistLookups: 40,
  spotifyResolutionTopK: 20,
  maxMusicBrainzLookups: 40,
  maxConsecutiveLastfmFailures: 2,
  maxConsecutiveSpotifySearchFailures: 2,
  deadlineAtMs: Number.POSITIVE_INFINITY,
  useSpotifyRelated: true,
  market: 'US',
  skipAlbumInfoLookup: false,
  skipAlbumDetailsLookup: false,
  skipMusicBrainz: false,
};

function elapsedTag(startMs: number): string {
  return `t+${Date.now() - startMs}ms`;
}

function pushDiag(
  sink: DiagEvent[] | undefined,
  startMs: number,
  stage: string,
  detail?: Record<string, unknown>,
) {
  if (!sink) return;
  sink.push({ at_ms: Date.now() - startMs, stage, detail });
}

export async function generateCandidates(
  admin: SupabaseClient,
  spotifyToken: string,
  taste: TasteSignal,
  exclusions: CandidateExclusions,
  recentArtistsToAvoid: Set<string>,
  opts: GenerateOpts = {},
): Promise<{ candidates: AlbumCandidate[]; spotifyRelatedAvailable: boolean }> {
  const { diag, ...rest } = opts;
  const o = { ...DEFAULTS, ...rest };
  const sourceArtists = taste.topArtists.slice(0, o.maxSourceArtists);
  const startMs = Date.now();
  console.log(
    `[candidates] start sources=${sourceArtists.length} maxCandidates=${o.maxCandidates} skipMb=${o.skipMusicBrainz} skipInfo=${o.skipAlbumInfoLookup}`,
  );
  pushDiag(diag, startMs, 'candidates_start', {
    sources: sourceArtists.length,
    max_candidates: o.maxCandidates,
  });

  let spotifyRelatedAvailable = false;

  type SimilarHit = {
    name: string;
    spotify_id?: string;
    best_match: number;
    source_paths: { source_artist: UserArtist; similar_match: number }[];
  };
  const similarMap = new Map<string, SimilarHit>();
  let consecutiveLastfmFailures = 0;

  for (const [srcIdx, src] of sourceArtists.entries()) {
    assertWithinDeadline(o.deadlineAtMs);
    const stageStart = Date.now();
    const lfmSim = await getLastfmSimilarCached(admin, src.name, src.spotify_id).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[candidates] lastfm_similar_failed artist="${src.name}" error=${msg}`);
      return null;
    });
    if (!lfmSim) {
      consecutiveLastfmFailures += 1;
      console.warn(
        `[candidates] source[${srcIdx}] "${src.name}" lfm_similar=null failures=${consecutiveLastfmFailures} ${elapsedTag(startMs)}`,
      );
      if (consecutiveLastfmFailures >= o.maxConsecutiveLastfmFailures) {
        throw new Error('lastfm_unavailable');
      }
      continue;
    }
    consecutiveLastfmFailures = 0;
    for (const s of lfmSim.slice(0, o.maxSimilarPerSource)) {
      mergeSimilar(similarMap, src, s.name, undefined, s.match);
    }
    if (o.useSpotifyRelated && src.spotify_id) {
      const spRel = await getSpotifyRelatedCached(admin, spotifyToken, src.spotify_id, src.name);
      if (spRel) {
        spotifyRelatedAvailable = true;
        for (const s of spRel.slice(0, o.maxSimilarPerSource)) {
          mergeSimilar(similarMap, src, s.name, s.id, 0.4);
        }
      }
    }
    console.log(
      `[candidates] source[${srcIdx}] "${src.name}" similars=${lfmSim.length} pool=${similarMap.size} took=${Date.now() - stageStart}ms ${elapsedTag(startMs)}`,
    );
    pushDiag(diag, startMs, 'source_done', {
      idx: srcIdx,
      artist: src.name,
      similars: lfmSim.length,
      pool: similarMap.size,
      took_ms: Date.now() - stageStart,
    });
  }

  console.log(`[candidates] similar_pool_ready size=${similarMap.size} ${elapsedTag(startMs)}`);
  pushDiag(diag, startMs, 'similar_pool_ready', { size: similarMap.size });

  const candidates: AlbumCandidate[] = [];
  const seenSpotifyIds = new Set<string>(exclusions.spotifyAlbumIds);
  let consecutiveSpotifySearchFailures = 0;
  let simIdx = 0;
  const textCandidates = new Map<string, TextCandidate>();

  const rankedSimilarHits = [...similarMap.values()]
    .sort((a, b) => scoreSimilarForTextExpansion(b) - scoreSimilarForTextExpansion(a))
    .slice(0, o.maxTextArtistLookups);
  pushDiag(diag, startMs, 'text_artist_pool_ready', {
    similar_pool: similarMap.size,
    lookup_count: rankedSimilarHits.length,
  });

  for (const sim of rankedSimilarHits) {
    assertWithinDeadline(o.deadlineAtMs);
    const simStageStart = Date.now();
    const currentSimIdx = simIdx++;
    pushDiag(diag, startMs, 'sim_start', { idx: currentSimIdx, artist: sim.name });
    const simNameLower = sim.name.toLowerCase().trim();
    if ([...recentArtistsToAvoid].some((a) => a.toLowerCase().trim() === simNameLower)) continue;

    let topAlbums: Awaited<ReturnType<typeof getLastfmTopAlbumsCached>>;
    try {
      topAlbums = await getLastfmTopAlbumsCached(admin, sim.name, o.maxAlbumsPerSimilar);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[candidates] lastfm_top_albums_failed artist="${sim.name}" error=${msg}`);
      consecutiveLastfmFailures += 1;
      if (consecutiveLastfmFailures >= o.maxConsecutiveLastfmFailures) {
        throw new Error('lastfm_unavailable');
      }
      continue;
    }
    assertWithinDeadline(o.deadlineAtMs);
    consecutiveLastfmFailures = 0;
    for (const ta of topAlbums) {
      assertWithinDeadline(o.deadlineAtMs);
      if (exclusions.normalizedAlbumKeys.has(normalizeAlbumKey(sim.name, ta.name))) continue;
      mergeTextCandidate(textCandidates, sim, ta);
    }
    console.log(
      `[candidates] sim[${currentSimIdx}] "${sim.name}" top=${topAlbums.length} text_candidates=${textCandidates.size} took=${Date.now() - simStageStart}ms ${elapsedTag(startMs)}`,
    );
    pushDiag(diag, startMs, 'sim_done', {
      idx: currentSimIdx,
      artist: sim.name,
      top: topAlbums.length,
      text_candidates: textCandidates.size,
      took_ms: Date.now() - simStageStart,
    });
  }

  const rankedTextCandidates = [...textCandidates.values()]
    .map((candidate) => ({ ...candidate, text_score: scoreTextCandidate(candidate) }))
    .sort((a, b) => b.text_score - a.text_score)
    .slice(0, Math.min(o.spotifyResolutionTopK, o.maxCandidates));
  console.log(
    `[candidates] text_pool_ready count=${textCandidates.size} resolving=${rankedTextCandidates.length} ${elapsedTag(startMs)}`,
  );
  pushDiag(diag, startMs, 'text_pool_ready', {
    count: textCandidates.size,
    resolving: rankedTextCandidates.length,
  });

  for (const text of rankedTextCandidates) {
    assertWithinDeadline(o.deadlineAtMs);
    if (candidates.length >= o.maxCandidates) break;
    let sp: Awaited<ReturnType<typeof resolveSpotifyAlbumCached>>;
    try {
      sp = await resolveSpotifyAlbumCached(
        admin,
        spotifyToken,
        text.candidate_artist_name,
        text.candidate_album_name,
        {
          market: o.market,
          userId: o.userId,
          requestContext: o.requestContext ?? 'candidate_generation',
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[candidates] spotify_search_failed artist="${text.candidate_artist_name}" album="${text.candidate_album_name}" error=${msg}`,
      );
      consecutiveSpotifySearchFailures += 1;
      const isCircuitOpen =
        e instanceof ExternalApiCircuitOpenError || msg.includes('circuit_open');
      if (
        isCircuitOpen ||
        consecutiveSpotifySearchFailures >= o.maxConsecutiveSpotifySearchFailures
      ) {
        throw new CandidateGenerationError(
          isCircuitOpen ? 'spotify_search_circuit_open' : 'spotify_search_failed',
          candidates,
          spotifyRelatedAvailable,
        );
      }
      continue;
    }
    if (!sp) {
      consecutiveSpotifySearchFailures = 0;
      console.log(
        `[candidates] spotify_search_no_match artist="${text.candidate_artist_name}" album="${text.candidate_album_name}" ${elapsedTag(startMs)}`,
      );
      pushDiag(diag, startMs, 'spotify_search_no_match', {
        artist: text.candidate_artist_name,
        album: text.candidate_album_name,
      });
      continue;
    }
    consecutiveSpotifySearchFailures = 0;
    if (seenSpotifyIds.has(sp.id)) continue;
    const primaryArtistName = sp.artists[0]?.name ?? text.candidate_artist_name;
    if (exclusions.normalizedAlbumKeys.has(normalizeAlbumKey(primaryArtistName, sp.name))) continue;

    let durationMs: number | undefined;
    let releaseLike = isRecommendationReleaseLike(sp);
    if (!releaseLike && !o.skipAlbumDetailsLookup && sp.total_tracks >= 2) {
      const details = await fetchAlbumDetails(spotifyToken, sp.id, o.market);
      durationMs = details?.duration_ms;
      releaseLike = isRecommendationReleaseLike({
        album_type: sp.album_type,
        total_tracks: sp.total_tracks,
        duration_ms: durationMs,
      });
    }
    if (!releaseLike) continue;
    seenSpotifyIds.add(sp.id);

    let infoListeners: number | undefined;
    let infoPlaycount: number | undefined;
    if (!o.skipAlbumInfoLookup) {
      const info = await fetchAlbumInfo(sp.artists[0]?.name ?? text.candidate_artist_name, sp.name);
      infoListeners = info?.listeners;
      infoPlaycount = info?.playcount;
    }

    candidates.push({
      spotify_id: sp.id,
      title: sp.name,
      primary_artist_name: primaryArtistName,
      primary_artist_spotify_id: sp.artists[0]?.id,
      cover_url: sp.images[0]?.url,
      total_tracks: sp.total_tracks,
      duration_ms: durationMs,
      release_year: parseYear(sp.release_date),
      album_type: sp.album_type,
      best_similarity_match: text.similarity_match,
      source_paths: text.source_paths.slice(),
      lastfm_listeners: infoListeners,
      lastfm_playcount: infoPlaycount ?? text.lastfm_playcount,
    });
  }

  console.log(`[candidates] gather_done count=${candidates.length} ${elapsedTag(startMs)}`);
  pushDiag(diag, startMs, 'gather_done', { count: candidates.length });

  if (o.skipMusicBrainz) {
    return { candidates, spotifyRelatedAvailable };
  }

  const filtered: AlbumCandidate[] = [];
  const seenReleaseGroups = new Set<string>(exclusions.releaseGroupIds);
  for (const [idx, c] of candidates.entries()) {
    assertWithinDeadline(o.deadlineAtMs);
    const mbStart = Date.now();
    const rg =
      idx < o.maxMusicBrainzLookups
        ? await getReleaseGroupCached(admin, c.primary_artist_name, c.title)
        : null;
    if (idx < o.maxMusicBrainzLookups) {
      console.log(
        `[candidates] mb[${idx}] "${c.primary_artist_name} - ${c.title}" ok=${rg ? 'yes' : 'null'} took=${Date.now() - mbStart}ms ${elapsedTag(startMs)}`,
      );
    }
    if (rg && !isAlbumLike(rg)) continue;
    if (rg?.id) {
      if (seenReleaseGroups.has(rg.id)) continue;
      seenReleaseGroups.add(rg.id);
      c.mb_release_group_id = rg.id;
    }
    filtered.push(c);
  }
  console.log(`[candidates] mb_done filtered=${filtered.length} ${elapsedTag(startMs)}`);

  return { candidates: filtered, spotifyRelatedAvailable };
}

/**
 * Validate a single candidate post-scoring. Returns:
 *   - ok=true with optional mb_release_group_id when the album passes MB checks
 *     (or when MB returns null — we trust Spotify in that case),
 *   - ok=false when MB explicitly says this is a comp / live / soundtrack / remix etc,
 *     or when the release group is already known to the user (releaseGroupIds set).
 */
export async function validateCandidateWithMb(
  admin: SupabaseClient,
  candidate: AlbumCandidate,
  releaseGroupIds: Set<string>,
): Promise<{ ok: boolean; rg: MbReleaseGroup | null }> {
  const rg = await getReleaseGroupCached(admin, candidate.primary_artist_name, candidate.title);
  if (!rg) return { ok: true, rg: null };
  if (!isAlbumLike(rg)) return { ok: false, rg };
  if (releaseGroupIds.has(rg.id)) return { ok: false, rg };
  return { ok: true, rg };
}

function assertWithinDeadline(deadlineAtMs: number) {
  if (Date.now() > deadlineAtMs) throw new Error('compute_timeout');
}

function mergeSimilar(
  map: Map<
    string,
    {
      name: string;
      spotify_id?: string;
      best_match: number;
      source_paths: { source_artist: UserArtist; similar_match: number }[];
    }
  >,
  source: UserArtist,
  name: string,
  spotifyId: string | undefined,
  match: number,
) {
  const key = name.toLowerCase().trim();
  const existing = map.get(key);
  if (existing) {
    if (match > existing.best_match) existing.best_match = match;
    if (spotifyId && !existing.spotify_id) existing.spotify_id = spotifyId;
    if (!existing.source_paths.some((p) => p.source_artist.name === source.name)) {
      existing.source_paths.push({ source_artist: source, similar_match: match });
    }
  } else {
    map.set(key, {
      name,
      spotify_id: spotifyId,
      best_match: match,
      source_paths: [{ source_artist: source, similar_match: match }],
    });
  }
}

function scoreSimilarForTextExpansion(sim: {
  best_match: number;
  source_paths: { source_artist: UserArtist; similar_match: number }[];
}) {
  const sourceFrequency = sim.source_paths.reduce(
    (sum, path) => sum + (path.source_artist.frequency ?? 1),
    0,
  );
  return 0.7 * clamp01(sim.best_match) + 0.3 * clamp01(Math.log1p(sourceFrequency) / Math.log(20));
}

function mergeTextCandidate(
  map: Map<string, TextCandidate>,
  sim: {
    name: string;
    best_match: number;
    source_paths: { source_artist: UserArtist; similar_match: number }[];
  },
  album: { name: string; playcount?: number },
) {
  const key = normalizeAlbumKey(sim.name, album.name);
  const sourceArtistFrequency = sim.source_paths.reduce(
    (sum, path) => sum + (path.source_artist.frequency ?? 1),
    0,
  );
  const existing = map.get(key);
  if (existing) {
    existing.similarity_match = Math.max(existing.similarity_match, sim.best_match);
    existing.source_artist_frequency = Math.max(
      existing.source_artist_frequency,
      sourceArtistFrequency,
    );
    existing.lastfm_playcount = Math.max(existing.lastfm_playcount ?? 0, album.playcount ?? 0);
    for (const path of sim.source_paths) {
      if (!existing.source_paths.some((p) => p.source_artist.name === path.source_artist.name)) {
        existing.source_paths.push(path);
      }
    }
    return;
  }
  map.set(key, {
    candidate_artist_name: sim.name,
    candidate_album_name: album.name,
    lastfm_playcount: album.playcount,
    similarity_match: sim.best_match,
    source_artist_frequency: sourceArtistFrequency,
    source_paths: sim.source_paths.slice(),
  });
}

function scoreTextCandidate(candidate: TextCandidate): number {
  const similarity = clamp01(candidate.similarity_match);
  const sourceFrequency = Math.log1p(Math.max(candidate.source_artist_frequency, 0)) / Math.log(20);
  const playcount = Math.log1p(Math.max(candidate.lastfm_playcount ?? 0, 0)) / Math.log(5_000_000);
  return 0.55 * similarity + 0.3 * clamp01(sourceFrequency) + 0.15 * clamp01(playcount);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseYear(d: string): number | undefined {
  const y = Number.parseInt(d?.slice(0, 4) ?? '', 10);
  return Number.isFinite(y) ? y : undefined;
}
