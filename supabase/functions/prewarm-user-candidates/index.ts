import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateFamiliarCatalogCandidates } from '../_shared/artist-catalog.ts';
import {
  countEligibleCachedCandidates,
  newestCandidateFetchedAt,
  pendingRetrySourceKeys,
  sourceArtistKeys,
  writeCandidatesToCache,
} from '../_shared/candidate-cache.ts';
import {
  type AlbumCandidate,
  type CandidateExclusions,
  CandidateGenerationError,
  type DiagEvent,
  generateCandidates,
} from '../_shared/candidate-generation.ts';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { getExternalApiCircuitState } from '../_shared/external-api-breaker.ts';
import { getValidSpotifyToken } from '../_shared/spotify.ts';
import { extractTasteSignal } from '../_shared/taste-extraction.ts';

const DEFAULT_LIMIT_USERS = 3;
const MAX_LIMIT_USERS = 10;
const DEFAULT_SOURCE_ARTIST_LIMIT = 20;
const MAX_SOURCE_ARTIST_LIMIT = 30;
const DEFAULT_SPOTIFY_RESOLUTION_TOP_K = 20;
const MAX_SPOTIFY_RESOLUTION_TOP_K = 40;
const DEFAULT_MAX_TEXT_ARTIST_LOOKUPS = 40;
const MAX_TEXT_ARTIST_LOOKUPS = 60;
const DEFAULT_FAMILIAR_CATALOG_LIMIT = 8;
const MAX_FAMILIAR_CATALOG_LIMIT = 15;
const FRESHNESS_DAYS = 7;
const MIN_FRESH_ELIGIBLE_CANDIDATES = 30;
const MAX_RUNTIME_MS = 95_000;
const USER_BUDGET_MS = 40_000;

type Payload = {
  user_id?: string;
  limit_users?: number;
  source_artist_limit?: number;
  spotify_resolution_top_k?: number;
  max_text_artist_lookups?: number;
  familiar_catalog_limit?: number;
  force?: boolean;
  diag?: boolean;
};

type LibraryStatusRow = {
  user_id: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'unauthorized');
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, 'invalid_json_body');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonError(500, 'missing_supabase_env');

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const startedAt = Date.now();
  const limitUsers = clampInt(payload.limit_users, DEFAULT_LIMIT_USERS, 1, MAX_LIMIT_USERS);
  const sourceArtistLimit = clampInt(
    payload.source_artist_limit,
    DEFAULT_SOURCE_ARTIST_LIMIT,
    1,
    MAX_SOURCE_ARTIST_LIMIT,
  );
  const spotifyResolutionTopK = clampInt(
    payload.spotify_resolution_top_k,
    DEFAULT_SPOTIFY_RESOLUTION_TOP_K,
    1,
    MAX_SPOTIFY_RESOLUTION_TOP_K,
  );
  const maxTextArtistLookups = clampInt(
    payload.max_text_artist_lookups,
    DEFAULT_MAX_TEXT_ARTIST_LOOKUPS,
    1,
    MAX_TEXT_ARTIST_LOOKUPS,
  );
  const familiarCatalogLimit = clampInt(
    payload.familiar_catalog_limit,
    DEFAULT_FAMILIAR_CATALOG_LIMIT,
    0,
    MAX_FAMILIAR_CATALOG_LIMIT,
  );
  const diag: DiagEvent[] = [];

  try {
    const userIds = payload.user_id
      ? [payload.user_id]
      : await loadCompletedSyncUsers(admin, limitUsers);
    const results = [];

    for (const userId of userIds) {
      if (!payload.user_id) {
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 2_000)));
      }
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        results.push({ user_id: userId, status: 'skipped', reason: 'runtime_budget_exceeded' });
        break;
      }
      try {
        results.push(
          await prewarmUser(admin, userId, {
            force: payload.force ?? false,
            sourceArtistLimit,
            spotifyResolutionTopK,
            maxTextArtistLookups,
            familiarCatalogLimit,
            diag: payload.diag ? diag : undefined,
          }),
        );
      } catch (e) {
        const reason = classifyPrewarmFailure(e);
        console.warn(`[prewarm-user-candidates] user=${userId} failed reason=${reason}`);
        results.push({
          user_id: userId,
          status: 'failed',
          reason,
          detail: formatError(e),
        });
      }
    }

    return jsonResponse({
      ok: true,
      attempted_users: userIds.length,
      results,
      ...(payload.diag ? { diag } : {}),
    });
  } catch (e) {
    return jsonError(500, 'prewarm_user_candidates_failed', formatError(e));
  }
});

async function loadCompletedSyncUsers(admin: SupabaseClient, limitUsers: number) {
  const { data, error } = await admin
    .from('library_sync_status')
    .select('user_id')
    .eq('status', 'completed')
    .order('updated_at', { ascending: true })
    .limit(limitUsers);
  if (error) throw new Error(`load_users_failed:${error.message}`);
  return ((data ?? []) as LibraryStatusRow[]).map((row) => row.user_id);
}

async function prewarmUser(
  admin: SupabaseClient,
  userId: string,
  opts: {
    force: boolean;
    sourceArtistLimit: number;
    spotifyResolutionTopK: number;
    maxTextArtistLookups: number;
    familiarCatalogLimit: number;
    diag?: DiagEvent[];
  },
) {
  const userStart = Date.now();
  const token = await getValidSpotifyToken(admin, userId);
  const taste = await extractTasteSignal(admin, userId, token, { includeTasteVector: false });
  const sourceKeys = sourceArtistKeys(taste, opts.sourceArtistLimit);

  if (taste.topArtists.length < 5) {
    return { user_id: userId, status: 'skipped', reason: 'library_too_small' };
  }

  if (!opts.force) {
    const keys = sourceKeys.map(({ key }) => key);
    const newest = await newestCandidateFetchedAt(admin, keys);
    const retryKeys = await pendingRetrySourceKeys(admin, keys);
    const cachedEligibleCount = await countEligibleCachedCandidates(admin, keys);
    if (
      newest &&
      !isOlderThanDays(newest, FRESHNESS_DAYS) &&
      retryKeys.size === 0 &&
      cachedEligibleCount >= MIN_FRESH_ELIGIBLE_CANDIDATES
    ) {
      return {
        user_id: userId,
        status: 'skipped',
        reason: 'fresh',
        newest_fetched_at: newest,
        cached_eligible_candidates: cachedEligibleCount,
      };
    }
  }

  const spotifySearchCircuit = await getExternalApiCircuitState(admin, 'spotify', 'search_album');
  if (spotifySearchCircuit.state === 'open') {
    return {
      user_id: userId,
      status: 'skipped',
      reason: 'spotify_search_circuit_open',
      cooldown_until: spotifySearchCircuit.cooldown_until,
    };
  }

  const exclusions: CandidateExclusions = {
    spotifyAlbumIds: new Set(),
    releaseGroupIds: new Set(),
    normalizedAlbumKeys: new Set(),
  };
  const deadlineAtMs = Math.min(Date.now() + USER_BUDGET_MS, userStart + MAX_RUNTIME_MS);
  let candidates: AlbumCandidate[];
  let partialReason: string | null = null;
  try {
    const generated = await generateCandidates(admin, token, taste, exclusions, new Set(), {
      maxSourceArtists: opts.sourceArtistLimit,
      maxSimilarPerSource: 8,
      maxAlbumsPerSimilar: 2,
      maxCandidates: 160,
      maxTextArtistLookups: opts.maxTextArtistLookups,
      spotifyResolutionTopK: opts.spotifyResolutionTopK,
      maxMusicBrainzLookups: 80,
      maxConsecutiveLastfmFailures: 3,
      maxConsecutiveSpotifySearchFailures: 3,
      deadlineAtMs,
      useSpotifyRelated: false,
      skipAlbumInfoLookup: false,
      skipAlbumDetailsLookup: false,
      skipMusicBrainz: true,
      diag: opts.diag,
      userId,
      requestContext: 'prewarm_user_candidates',
    });
    candidates = generated.candidates;
  } catch (e) {
    if (!(e instanceof CandidateGenerationError)) {
      throw e;
    }
    candidates = e.candidates;
    partialReason = classifyPrewarmFailure(e);
    if (candidates.length === 0 && partialReason === 'spotify_search_circuit_open') {
      return { user_id: userId, status: 'skipped', reason: partialReason };
    }
    if (candidates.length === 0) throw e;
    console.warn(
      `[prewarm-user-candidates] user=${userId} saving_partial_candidates=${candidates.length} reason=${partialReason}`,
    );
  }

  await writeCandidatesToCache(admin, candidates);

  let familiarCandidates: AlbumCandidate[] = [];
  if (opts.familiarCatalogLimit > 0) {
    try {
      familiarCandidates = await generateFamiliarCatalogCandidates(
        admin,
        token,
        taste,
        exclusions,
        new Set(), // do not apply recent-artist filter during warm — cache for future days
        {
          maxSourceArtists: opts.familiarCatalogLimit,
          maxAlbumsPerArtist: 3,
          market: 'US',
          userId,
          requestContext: 'prewarm_user_candidates_familiar',
        },
      );
      if (familiarCandidates.length > 0) {
        await writeCandidatesToCache(admin, familiarCandidates, 'spotify');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[prewarm-user-candidates] user=${userId} familiar_catalog_failed error=${msg}`);
      // familiar warm failure must not discard similar-artist candidates already saved
    }
  }

  return {
    user_id: userId,
    status: partialReason ? 'partial' : 'warmed',
    ...(partialReason ? { reason: partialReason } : {}),
    candidates: candidates.length,
    familiar_candidates: familiarCandidates.length,
    took_ms: Date.now() - userStart,
  };
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

function isOlderThanDays(iso: string, days: number) {
  return Date.now() - new Date(iso).getTime() > days * 24 * 60 * 60 * 1000;
}

function formatError(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function classifyPrewarmFailure(e: unknown) {
  const message = formatError(e);
  if (message.includes('spotify_search_circuit_open')) return 'spotify_search_circuit_open';
  if (message.includes('spotify_search')) return 'spotify_search_failed';
  if (message.includes('lastfm')) return 'lastfm_unavailable';
  if (message.includes('compute_timeout')) return 'timeout';
  if (message.includes('spotify_token')) return 'spotify_token_failed';
  return 'unknown_error';
}
