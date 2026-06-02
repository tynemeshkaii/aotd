import { createClient } from '@supabase/supabase-js';
import { normalizeAlbumKey } from '../_shared/album-dedupe.ts';
import { loadCachedCandidates, writeCandidatesToCache } from '../_shared/candidate-cache.ts';
import {
  type AlbumCandidate,
  type CandidateExclusions,
  type DiagEvent,
  generateCandidates,
  validateCandidateWithMb,
} from '../_shared/candidate-generation.ts';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { getCuratedFallback } from '../_shared/curated-fallback.ts';
import { getExternalApiCircuitState } from '../_shared/external-api-breaker.ts';
import { getArtistCountryCached } from '../_shared/musicbrainz.ts';
import { computePoolRelativeProfile } from '../_shared/popularity-bucket.ts';
import {
  ALGORITHM_VERSION,
  buildSelectionReason,
  type ScoredCandidate,
  scoreCandidates,
  selectFromTop,
} from '../_shared/recommendation-algorithm.ts';
import { getValidSpotifyToken } from '../_shared/spotify.ts';
import { fetchAlbumDetails } from '../_shared/spotify-extended.ts';
import { extractTasteSignal, type TasteSignal } from '../_shared/taste-extraction.ts';

const PRIMARY_COMPUTE_BUDGET_MS = 25_000;
const SPOTIFY_TOKEN_STAGE_TIMEOUT_MS = 10_000;
const TASTE_STAGE_TIMEOUT_MS = 12_000;
const CANDIDATE_STAGE_TIMEOUT_MS = 20_000;
const DB_STAGE_TIMEOUT_MS = 8_000;
const FALLBACK_STAGE_TIMEOUT_MS = 12_000;
const POST_SELECTION_DETAILS_TIMEOUT_MS = 4_000;
const MIN_CACHE_POOL_SIZE = 30;
const MIN_TOTAL_POOL_SIZE = 5;
// Fix 1/2 — source-artist diversity controls.
const RECENT_SOURCE_WINDOW = 7;
const MAX_PER_SOURCE_ARTIST = 3;

type FallbackReason =
  | 'no_candidates'
  | 'spotify_search_failed'
  | 'spotify_audio_unavailable'
  | 'lastfm_unavailable'
  | 'mb_timeout'
  | 'library_too_small'
  | 'compute_timeout'
  | 'unknown_error';

type UserLibraryExclusionRow = {
  provider_album_id: string | null;
  mb_release_group_id: string | null;
  album_name: string | null;
  artist_name: string | null;
};

type AlbumJoin = {
  spotify_id: string | null;
  mb_release_group_id: string | null;
  primary_artist_name: string | null;
  title: string | null;
};

type HistoryRow = {
  album: AlbumJoin | null;
};

type RecentPickRow = {
  album: Pick<AlbumJoin, 'primary_artist_name'> | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'unauthorized');
  }

  let payload: {
    user_id?: string;
    target_date?: string;
    user_timezone?: string;
    force_fallback?: boolean;
    diag?: boolean;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, 'invalid_json_body');
  }

  const userId = payload.user_id;
  if (!userId) return jsonError(400, 'missing_user_id');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(500, 'missing_supabase_env');
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let targetDate = payload.target_date;
  let userTz = payload.user_timezone ?? 'UTC';
  if (!targetDate) {
    const { data: ctx, error: ctxErr } = await admin.rpc('resolve_user_compute_context', {
      p_user_id: userId,
    });
    if (ctxErr) return jsonError(500, 'context_resolve_failed', ctxErr.message);
    const row = Array.isArray(ctx) ? ctx[0] : ctx;
    targetDate = row?.target_date;
    userTz = row?.user_tz ?? 'UTC';
    if (!targetDate) return jsonError(400, 'profile_not_found');
  }

  const { data: existing } = await admin
    .from('albums_of_the_day')
    .select('id')
    .eq('user_id', userId)
    .eq('date', targetDate)
    .maybeSingle();
  if (existing) {
    return jsonResponse({
      ok: true,
      status: 'already_exists',
      aotd_id: existing.id,
    });
  }

  let albumId: string | null = null;
  let selectionReason: Record<string, unknown> = {};
  let isFallback = false;
  let fallbackReason: FallbackReason | null = null;
  let taste: TasteSignal | null = null;
  const requestStartMs = Date.now();
  const diag: DiagEvent[] = [];
  const recordDiag = (stage: string, detail?: Record<string, unknown>) => {
    diag.push({ at_ms: Date.now() - requestStartMs, stage, detail });
  };

  try {
    const primaryDeadlineAtMs = Date.now() + PRIMARY_COMPUTE_BUDGET_MS;
    console.log(`[compute] primary_start user=${userId} date=${targetDate}`);
    recordDiag('primary_start');
    if (payload.force_fallback) {
      fallbackReason = 'compute_timeout';
      throw new Error('forced_fallback');
    }
    const spotifyToken = await withTimeout(
      getValidSpotifyToken(admin, userId),
      SPOTIFY_TOKEN_STAGE_TIMEOUT_MS,
      'spotify_token_timeout',
    );
    console.log(`[compute] spotify_token_ok user=${userId}`);
    recordDiag('spotify_token_ok');
    taste = await withTimeout(
      extractTasteSignal(admin, userId, spotifyToken, {
        includeTasteVector: false,
      }),
      TASTE_STAGE_TIMEOUT_MS,
      'taste_signal_timeout',
    );
    console.log(
      `[compute] taste_ready user=${userId} library_size=${taste.librarySize} top_artists=${taste.topArtists.length}`,
    );
    recordDiag('taste_ready', {
      library_size: taste.librarySize,
      top_artists: taste.topArtists.length,
      source_artists: taste.topArtists.slice(0, 8).map((artist) => artist.name),
    });
    if (taste.topArtists.length < 5) {
      fallbackReason = 'library_too_small';
      throw new Error('library_too_small');
    }

    const { data: lib } = await admin
      .from('user_library')
      .select('provider_album_id, mb_release_group_id, album_name, artist_name')
      .eq('user_id', userId)
      .is('removed_at', null);
    const libRows = (lib ?? []) as UserLibraryExclusionRow[];

    const { data: hist } = await admin
      .from('recommendation_history')
      .select('album:albums(spotify_id, mb_release_group_id, primary_artist_name, title)')
      .eq('user_id', userId);
    const historyRows = (hist ?? []) as unknown as HistoryRow[];

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: recentPicks } = await admin
      .from('albums_of_the_day')
      .select('album:albums(primary_artist_name)')
      .eq('user_id', userId)
      .gte('date', since);
    const recentArtists = new Set(
      ((recentPicks ?? []) as unknown as RecentPickRow[])
        .map((r) => r.album?.primary_artist_name)
        .filter(isNonEmptyString),
    );

    // Fix 1 — recent *source* artists (the library artist shown as
    // "Picked because you've been saving stuff by X"). Distinct from recentArtists,
    // which excludes recent *candidate* artists. Penalizes serving the same source
    // artist's similarity graph day after day. Window: last RECENT_SOURCE_WINDOW picks.
    const { data: recentSourcePicks } = await admin
      .from('albums_of_the_day')
      .select('selection_reason, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(RECENT_SOURCE_WINDOW);
    const recentSourceArtists = new Set(
      (
        (recentSourcePicks ?? []) as {
          selection_reason: Record<string, unknown> | null;
        }[]
      )
        .map((r) => {
          const reason = r.selection_reason as {
            primary_source_artist?: unknown;
          } | null;
          return typeof reason?.primary_source_artist === 'string'
            ? reason.primary_source_artist
            : null;
        })
        .filter(isNonEmptyString),
    );
    recordDiag('recent_source_artists', { count: recentSourceArtists.size });

    const exclusions = buildCandidateExclusions(libRows, historyRows);
    recordDiag('exclusions_built', {
      lib_rows: libRows.length,
      history_rows: historyRows.length,
      excluded_spotify: exclusions.spotifyAlbumIds.size,
      excluded_rg: exclusions.releaseGroupIds.size,
    });

    let candidates = await withTimeout(
      loadCachedCandidates(admin, taste, 20, exclusions, recentArtists),
      DB_STAGE_TIMEOUT_MS,
      'candidate_cache_timeout',
    );
    let spotifyRelatedAvailable = false;
    console.log(`[compute] cache_candidates_ready user=${userId} count=${candidates.length}`);
    recordDiag('cache_candidates_ready', { count: candidates.length });

    if (candidates.length < MIN_CACHE_POOL_SIZE && Date.now() < primaryDeadlineAtMs - 1_000) {
      const spotifySearchCircuit = await getExternalApiCircuitState(
        admin,
        'spotify',
        'search_album',
      );
      if (spotifySearchCircuit.state === 'open') {
        recordDiag('live_recovery_skipped', {
          reason: 'spotify_search_circuit_open',
          cooldown_until: spotifySearchCircuit.cooldown_until,
        });
      } else {
        const liveRecovery = await withTimeout(
          generateCandidates(admin, spotifyToken, taste, exclusions, recentArtists, {
            maxSourceArtists: 5,
            maxSimilarPerSource: 6,
            maxAlbumsPerSimilar: 2,
            maxCandidates: 28,
            maxTextArtistLookups: 16,
            spotifyResolutionTopK: 8,
            maxConsecutiveLastfmFailures: 2,
            maxConsecutiveSpotifySearchFailures: 2,
            deadlineAtMs: primaryDeadlineAtMs,
            useSpotifyRelated: false,
            skipAlbumInfoLookup: true,
            skipAlbumDetailsLookup: true,
            skipMusicBrainz: true,
            diag,
            userId,
            requestContext: 'compute_live_recovery',
          }),
          Math.max(1_000, Math.min(CANDIDATE_STAGE_TIMEOUT_MS, primaryDeadlineAtMs - Date.now())),
          'compute_timeout',
        );
        spotifyRelatedAvailable = liveRecovery.spotifyRelatedAvailable;
        try {
          await writeCandidatesToCache(admin, liveRecovery.candidates);
        } catch (cacheWriteError) {
          console.warn(
            `[compute] candidate_cache_write_failed user=${userId} error=${
              cacheWriteError instanceof Error ? cacheWriteError.message : String(cacheWriteError)
            }`,
          );
        }
        candidates = mergeCandidates(candidates, liveRecovery.candidates);
        console.log(
          `[compute] live_recovery_done user=${userId} live=${liveRecovery.candidates.length} total=${candidates.length}`,
        );
        recordDiag('live_recovery_done', {
          live_count: liveRecovery.candidates.length,
          total_count: candidates.length,
        });
      }
    }

    console.log(`[compute] candidates_ready user=${userId} count=${candidates.length}`);
    recordDiag('candidates_ready', { count: candidates.length });

    if (candidates.length < MIN_TOTAL_POOL_SIZE) {
      fallbackReason = 'no_candidates';
      throw new Error('no_candidates');
    }

    const scored = scoreCandidates(
      candidates,
      taste,
      undefined,
      undefined,
      undefined,
      recentSourceArtists,
    );
    let chosen = selectFromTop(scored, undefined, undefined, MAX_PER_SOURCE_ARTIST);
    if (!chosen) {
      fallbackReason = 'no_candidates';
      throw new Error('selection_empty');
    }

    // Shadow mode: re-score the same pool with pool-relative popularity banding.
    // Best-effort; must never fail or slow the real pick.
    //
    // Use the deterministic argmax (top-ranked) of each ranking, NOT a sampled
    // selectFromTop pick. The served pick is sampled + MusicBrainz-validated, so
    // comparing it against a sampled shadow would confound the banding effect with
    // RNG noise and MB-asymmetry. Argmax-vs-argmax (`scored[0]` vs `shadowScored[0]`)
    // isolates exactly what relative banding changed.
    let shadowChosen: ScoredCandidate | null = null;
    const liveTop = scored[0] ?? null;
    try {
      const profile = computePoolRelativeProfile(candidates.map((c) => c.lastfm_listeners));
      if (profile) {
        const shadowScored = scoreCandidates(
          candidates,
          taste,
          undefined,
          undefined,
          profile,
          recentSourceArtists,
        );
        shadowChosen = shadowScored[0] ?? null;
      }
    } catch (shadowErr) {
      const msg = shadowErr instanceof Error ? shadowErr.message : String(shadowErr);
      console.warn(`[compute] shadow_scoring_failed user=${userId} error=${msg}`);
      recordDiag('shadow_scoring_failed', { error: msg });
    }

    // Validate the chosen candidate against MusicBrainz post-scoring. Up to 3 attempts
    // — each MB lookup costs ~1.1 s due to the upstream rate limit. If all attempts fail,
    // ship the best non-validated candidate rather than falling back unnecessarily.
    const MAX_MB_RETRIES = 3;
    let mbAttempts = 0;
    let artistCountry: string | null = null;
    const tried = new Set<string>();
    while (mbAttempts < MAX_MB_RETRIES && Date.now() < primaryDeadlineAtMs) {
      tried.add(chosen.candidate.spotify_id);
      const validation = await validateCandidateWithMb(
        admin,
        chosen.candidate,
        exclusions.releaseGroupIds,
      );
      if (validation.ok) {
        if (validation.rg?.id) {
          chosen.candidate.mb_release_group_id = validation.rg.id;
        }
        if (validation.rg?.artist && Date.now() < primaryDeadlineAtMs - 500) {
          try {
            artistCountry = await withTimeout(
              getArtistCountryCached(admin, validation.rg.artist),
              Math.max(500, Math.min(2_000, primaryDeadlineAtMs - Date.now())),
              'artist_country_timeout',
            );
            if (artistCountry) {
              recordDiag('artist_country_ok', { country: artistCountry });
            }
          } catch (countryError) {
            const msg = countryError instanceof Error ? countryError.message : String(countryError);
            console.warn(
              `[compute] artist_country_failed user=${userId} album=${chosen.candidate.spotify_id} error=${msg}`,
            );
            recordDiag('artist_country_failed', { error: msg });
          }
        }
        break;
      }
      mbAttempts += 1;
      console.log(
        `[compute] mb_rejected user=${userId} album=${chosen.candidate.spotify_id} reason=${
          validation.rg ? 'not_album_like_or_dup' : 'unknown'
        } attempt=${mbAttempts}`,
      );
      const next = scored.find((s) => !tried.has(s.candidate.spotify_id));
      if (!next) break;
      chosen = next;
    }

    if (!chosen.candidate.duration_ms && Date.now() < primaryDeadlineAtMs - 1_000) {
      try {
        const timeoutMs = Math.max(
          1_000,
          Math.min(POST_SELECTION_DETAILS_TIMEOUT_MS, primaryDeadlineAtMs - Date.now()),
        );
        const details = await withTimeout(
          fetchAlbumDetails(spotifyToken, chosen.candidate.spotify_id),
          timeoutMs,
          'post_selection_album_details_timeout',
        );
        if (details?.duration_ms) {
          chosen.candidate.duration_ms = details.duration_ms;
          recordDiag('post_selection_details_ok', {
            duration_ms: details.duration_ms,
          });
        }
      } catch (detailsError) {
        const msg = detailsError instanceof Error ? detailsError.message : String(detailsError);
        console.warn(
          `[compute] post_selection_album_details_failed user=${userId} album=${chosen.candidate.spotify_id} error=${msg}`,
        );
        recordDiag('post_selection_details_failed', { error: msg });
      }
    }

    const { data: albumRow, error: albumErr } = await withTimeout(
      admin
        .from('albums')
        .upsert(
          {
            spotify_id: chosen.candidate.spotify_id,
            mb_release_group_id: chosen.candidate.mb_release_group_id ?? null,
            ...(artistCountry ? { artist_country: artistCountry } : {}),
            title: chosen.candidate.title,
            primary_artist_name: chosen.candidate.primary_artist_name,
            primary_artist_spotify_id: chosen.candidate.primary_artist_spotify_id ?? null,
            release_year: chosen.candidate.release_year ?? null,
            cover_url: chosen.candidate.cover_url ?? null,
            total_tracks: chosen.candidate.total_tracks,
            duration_ms: chosen.candidate.duration_ms ?? null,
            album_type: chosen.candidate.album_type ?? null,
            lastfm_listeners: chosen.candidate.lastfm_listeners ?? null,
            lastfm_playcount: chosen.candidate.lastfm_playcount ?? null,
            metadata_updated_at: new Date().toISOString(),
          },
          { onConflict: 'spotify_id' },
        )
        .select('id')
        .single(),
      DB_STAGE_TIMEOUT_MS,
      'album_upsert_timeout',
    );

    if (albumErr || !albumRow) {
      fallbackReason = 'unknown_error';
      throw new Error(`album_upsert_failed:${albumErr?.message}`);
    }

    albumId = albumRow.id;
    selectionReason = buildSelectionReason(chosen, taste, spotifyRelatedAvailable);
    console.log(`[compute] primary_selected user=${userId} album=${chosen.candidate.spotify_id}`);

    // Shadow write — best-effort, short timeout, no throw
    // same_as_live compares argmax-to-argmax (global banding vs relative banding) to
    // isolate the banding effect. live_album_id stays the actually-served pick.
    if (shadowChosen && liveTop && !isFallback) {
      try {
        const shadowWriteStart = Date.now();
        const sameAsLive = shadowChosen.candidate.spotify_id === liveTop.candidate.spotify_id;
        let shadowAlbumId: string | null = sameAsLive ? albumId : null;

        if (!sameAsLive) {
          const { data: existing } = await withTimeout(
            admin
              .from('albums')
              .select('id')
              .eq('spotify_id', shadowChosen.candidate.spotify_id)
              .maybeSingle(),
            1_500,
            'shadow_album_lookup_timeout',
          );
          if (existing?.id) {
            shadowAlbumId = existing.id;
          } else {
            const { data: upserted, error: shadowUpsertErr } = await withTimeout(
              admin
                .from('albums')
                .upsert(
                  {
                    spotify_id: shadowChosen.candidate.spotify_id,
                    mb_release_group_id: shadowChosen.candidate.mb_release_group_id ?? null,
                    title: shadowChosen.candidate.title,
                    primary_artist_name: shadowChosen.candidate.primary_artist_name,
                    primary_artist_spotify_id:
                      shadowChosen.candidate.primary_artist_spotify_id ?? null,
                    release_year: shadowChosen.candidate.release_year ?? null,
                    cover_url: shadowChosen.candidate.cover_url ?? null,
                    total_tracks: shadowChosen.candidate.total_tracks,
                    duration_ms: shadowChosen.candidate.duration_ms ?? null,
                    album_type: shadowChosen.candidate.album_type ?? null,
                    lastfm_listeners: shadowChosen.candidate.lastfm_listeners ?? null,
                    lastfm_playcount: shadowChosen.candidate.lastfm_playcount ?? null,
                    metadata_updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'spotify_id' },
                )
                .select('id')
                .single(),
              2_000,
              'shadow_album_upsert_timeout',
            );
            if (!shadowUpsertErr && upserted?.id) {
              shadowAlbumId = upserted.id;
            }
          }
        }

        if (shadowAlbumId) {
          await withTimeout(
            admin.from('aotd_shadow_picks').upsert(
              {
                user_id: userId,
                date: targetDate,
                live_album_id: albumId,
                shadow_album_id: shadowAlbumId,
                shadow_selection_reason: buildSelectionReason(
                  shadowChosen,
                  taste,
                  spotifyRelatedAvailable,
                ),
                shadow_algorithm_version: 3,
                same_as_live: sameAsLive,
              },
              { onConflict: 'user_id,date' },
            ),
            2_000,
            'shadow_write_timeout',
          );
        }
        console.log(
          `[compute] shadow_written user=${userId} same_as_live=${sameAsLive} took=${
            Date.now() - shadowWriteStart
          }ms`,
        );
      } catch (shadowWriteErr) {
        const msg =
          shadowWriteErr instanceof Error ? shadowWriteErr.message : String(shadowWriteErr);
        console.warn(`[compute] shadow_write_failed user=${userId} error=${msg}`);
        recordDiag('shadow_write_failed', { error: msg });
      }
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.warn(`[compute] primary failed for ${userId}: ${errMsg}`);
    recordDiag('primary_failed', { error: errMsg });
    isFallback = true;
    if (!fallbackReason) {
      fallbackReason = classifyFallbackReason(errMsg);
    }
    let fb: { album_id: string } | null;
    try {
      fb = await withTimeout(
        getCuratedFallback(admin, userId, taste ?? undefined),
        FALLBACK_STAGE_TIMEOUT_MS,
        'fallback_timeout',
      );
    } catch (fallbackError) {
      return jsonError(
        500,
        'fallback_failed',
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      );
    }
    if (!fb) {
      return jsonError(500, 'no_album_available', String(e));
    }
    console.log(`[compute] fallback_selected user=${userId} reason=${fallbackReason}`);
    albumId = fb.album_id;
    const fallbackScored: ScoredCandidate = {
      candidate: {
        spotify_id: 'fallback',
        title: 'Fallback',
        primary_artist_name: 'Fallback',
        total_tracks: 0,
        best_similarity_match: 0,
        source_paths: [],
      },
      score: 0,
      breakdown: {
        similarity: 0,
        source_freq: 0,
        popularity: 0,
        balance: 0,
        temperature: 0,
      },
    };
    selectionReason = buildSelectionReason(
      fallbackScored,
      {
        topArtists: [],
        tasteVector: null,
        librarySize: 0,
        libraryDecadeFractions: {},
      },
      false,
      true,
      fallbackReason,
    );
  }

  if (!albumId) return jsonError(500, 'no_album_id');

  const { data: ensured, error: ensureErr } = await withTimeout(
    admin.rpc('ensure_recommendation_atomic', {
      p_user_id: userId,
      p_album_id: albumId,
      p_date: targetDate,
      p_algorithm_version: ALGORITHM_VERSION,
      p_selection_reason: selectionReason,
      p_is_fallback: isFallback,
      p_fallback_reason: fallbackReason,
      p_user_timezone: userTz,
    }),
    DB_STAGE_TIMEOUT_MS,
    'aotd_insert_timeout',
  );

  if (ensureErr) return jsonError(500, 'aotd_insert_failed', ensureErr.message);
  const ensuredRow = Array.isArray(ensured) ? ensured[0] : ensured;

  recordDiag('done', {
    is_fallback: isFallback,
    fallback_reason: fallbackReason,
  });
  return jsonResponse({
    ok: true,
    status: ensuredRow?.created ? 'created' : 'already_exists',
    aotd_id: ensuredRow?.aotd_id,
    is_fallback: isFallback,
    fallback_reason: fallbackReason,
    ...(payload.diag ? { diag } : {}),
  });
});

function classifyFallbackReason(message: string): FallbackReason {
  if (message.includes('spotify_search')) return 'spotify_search_failed';
  if (message.includes('lastfm') || message.includes('missing_lastfm')) {
    return 'lastfm_unavailable';
  }
  if (message.includes('no_candidates') || message.includes('selection_empty')) {
    return 'no_candidates';
  }
  if (message.includes('library_too_small')) return 'library_too_small';
  if (message.includes('mb_timeout')) return 'mb_timeout';
  if (
    message.includes('compute_timeout') ||
    message.includes('spotify_token') ||
    message.includes('taste_signal')
  ) {
    return 'compute_timeout';
  }
  return 'unknown_error';
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function buildCandidateExclusions(
  libRows: UserLibraryExclusionRow[],
  historyRows: HistoryRow[],
): CandidateExclusions {
  const spotifyAlbumIds = new Set<string>();
  const releaseGroupIds = new Set<string>();
  const normalizedAlbumKeys = new Set<string>();

  for (const row of libRows) {
    if (isNonEmptyString(row.provider_album_id)) {
      spotifyAlbumIds.add(row.provider_album_id);
    }
    if (isNonEmptyString(row.mb_release_group_id)) {
      releaseGroupIds.add(row.mb_release_group_id);
    }
    addNormalizedKey(normalizedAlbumKeys, row.artist_name, row.album_name);
  }

  for (const row of historyRows) {
    const album = row.album;
    if (!album) continue;
    if (isNonEmptyString(album.spotify_id)) {
      spotifyAlbumIds.add(album.spotify_id);
    }
    if (isNonEmptyString(album.mb_release_group_id)) {
      releaseGroupIds.add(album.mb_release_group_id);
    }
    addNormalizedKey(normalizedAlbumKeys, album.primary_artist_name, album.title);
  }

  return { spotifyAlbumIds, releaseGroupIds, normalizedAlbumKeys };
}

function addNormalizedKey(
  keys: Set<string>,
  artist: string | null | undefined,
  album: string | null | undefined,
) {
  if (!isNonEmptyString(artist) || !isNonEmptyString(album)) return;
  keys.add(normalizeAlbumKey(artist, album));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function mergeCandidates(a: AlbumCandidate[], b: AlbumCandidate[]) {
  const out = new Map<string, AlbumCandidate>();
  for (const candidate of [...a, ...b]) {
    const existing = out.get(candidate.spotify_id);
    if (!existing) {
      out.set(candidate.spotify_id, candidate);
      continue;
    }
    existing.best_similarity_match = Math.max(
      existing.best_similarity_match,
      candidate.best_similarity_match,
    );
    for (const path of candidate.source_paths) {
      if (!existing.source_paths.some((p) => p.source_artist.name === path.source_artist.name)) {
        existing.source_paths.push(path);
      }
    }
  }
  return [...out.values()];
}
