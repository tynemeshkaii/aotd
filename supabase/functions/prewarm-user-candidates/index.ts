import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateFamiliarCatalogCandidates } from '../_shared/artist-catalog.ts';
import {
  countDistinctEligibleSourceArtists,
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
import { peekExternalApiCircuitState } from '../_shared/external-api-breaker.ts';
import { getValidSpotifyToken } from '../_shared/spotify.ts';
import { extractTasteSignal } from '../_shared/taste-extraction.ts';

const DEFAULT_LIMIT_USERS = 3;
const MAX_LIMIT_USERS = 10;
const DEFAULT_SOURCE_ARTIST_LIMIT = 20;
const MAX_SOURCE_ARTIST_LIMIT = 30;
const DEFAULT_SPOTIFY_RESOLUTION_TOP_K = 40;
const MAX_SPOTIFY_RESOLUTION_TOP_K = 80;
const DEFAULT_MAX_TEXT_ARTIST_LOOKUPS = 40;
const MAX_TEXT_ARTIST_LOOKUPS = 60;
// Fix 3 (Bug A) — cap resolved candidates per source artist so the pool spreads across
// many library artists instead of concentrating on the few highest-frequency ones.
const MAX_RESOLVE_PER_SOURCE_ARTIST = 4;
const DEFAULT_FAMILIAR_CATALOG_LIMIT = 8;
const MAX_FAMILIAR_CATALOG_LIMIT = 15;
const FRESHNESS_DAYS = 7;
const MIN_FRESH_ELIGIBLE_CANDIDATES = 30;
// Fix 3 (Bug B) — a pool is only "fresh" if it also spans enough distinct source
// artists. 39 eligible albums from 4 sources is stale-quality (repetitive picks).
const MIN_FRESH_SOURCE_ARTISTS = 8;
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
    const globalDeadlineAtMs = startedAt + MAX_RUNTIME_MS;

    for (const userId of userIds) {
      if (!payload.user_id) {
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 2_000)));
      }
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        results.push({ user_id: userId, status: 'skipped', reason: 'runtime_budget_exceeded' });
        break;
      }
      try {
        const result = await prewarmUser(admin, userId, {
          force: payload.force ?? false,
          sourceArtistLimit,
          spotifyResolutionTopK,
          maxTextArtistLookups,
          familiarCatalogLimit,
          globalDeadlineAtMs,
          diag: payload.diag ? diag : undefined,
        });
        results.push(result);
        // Rotate this user to the back of the cron queue regardless of warmed /
        // partial / skipped — only hard failures (caught below) are left
        // un-stamped so they retry sooner. Skip when a specific user was
        // targeted (no fairness rotation needed for a direct call).
        if (!payload.user_id) {
          await stampUserPrewarmed(admin, userId);
        }
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
  // Fairness rotation: pick never-warmed users first (last_prewarmed_at null),
  // then the longest-ago-warmed. Ordering by sync `updated_at` instead would
  // re-select the same head-of-list users every tick and starve the tail once
  // the user count exceeds limitUsers.
  const { data, error } = await admin
    .from('library_sync_status')
    .select('user_id')
    .eq('status', 'completed')
    .order('last_prewarmed_at', { ascending: true, nullsFirst: true })
    .order('updated_at', { ascending: true })
    .limit(limitUsers);
  if (error) throw new Error(`load_users_failed:${error.message}`);
  return ((data ?? []) as LibraryStatusRow[]).map((row) => row.user_id);
}

async function stampUserPrewarmed(admin: SupabaseClient, userId: string) {
  const { error } = await admin
    .from('library_sync_status')
    .update({ last_prewarmed_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) {
    console.warn(`[prewarm-user-candidates] stamp_failed user=${userId} error=${error.message}`);
  }
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
    globalDeadlineAtMs: number;
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
    const cachedSourceArtistCount = await countDistinctEligibleSourceArtists(admin, keys);
    opts.diag?.push({
      at_ms: Date.now() - userStart,
      stage: 'prewarm_freshness_checked',
      detail: {
        newest_fetched_at: newest,
        cached_eligible_candidates: cachedEligibleCount,
        cached_source_artists: cachedSourceArtistCount,
        pending_retry_source_artists: retryKeys.size,
      },
    });
    if (
      newest &&
      !isOlderThanDays(newest, FRESHNESS_DAYS) &&
      retryKeys.size === 0 &&
      cachedEligibleCount >= MIN_FRESH_ELIGIBLE_CANDIDATES &&
      cachedSourceArtistCount >= MIN_FRESH_SOURCE_ARTISTS
    ) {
      return {
        user_id: userId,
        status: 'skipped',
        reason: 'fresh',
        newest_fetched_at: newest,
        cached_eligible_candidates: cachedEligibleCount,
        cached_source_artists: cachedSourceArtistCount,
      };
    }
  }

  const spotifySearchCircuit = await peekExternalApiCircuitState(admin, 'spotify', 'search_album');
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
  // Bound by both the per-user budget and the function-global runtime budget
  // (startedAt + MAX_RUNTIME_MS), so a late user in the batch cannot overrun the
  // whole invocation.
  const deadlineAtMs = Math.min(Date.now() + USER_BUDGET_MS, opts.globalDeadlineAtMs);
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
      maxResolvePerSourceArtist: MAX_RESOLVE_PER_SOURCE_ARTIST,
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

  // A cache-write failure (e.g. a transient conflict that survives the single
  // retry inside writeCandidatesToCache) must not flip a successfully-generated
  // warm into a hard `failed` that day-1 reads as a prewarm gate failure.
  // Downgrade to `partial`; compute will still produce its own fallback if the
  // cache ends up thin.
  try {
    await writeCandidatesToCache(admin, candidates);
  } catch (e) {
    if (!partialReason) partialReason = 'cache_write_failed';
    console.warn(
      `[prewarm-user-candidates] user=${userId} candidate_cache_write_failed error=${formatError(e)}`,
    );
  }

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
