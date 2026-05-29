import { createClient } from '@supabase/supabase-js';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { fetchGloballyTopAlbums } from '../_shared/lastfm.ts';
import { getLastfmTopAlbumsCached } from '../_shared/lastfm-top-albums-cache.ts';
import { isRecommendationReleaseLike } from '../_shared/release-eligibility.ts';
import { resolveSpotifyAlbumCached } from '../_shared/spotify-album-resolution-cache.ts';
import { fetchAlbumDetails, getServiceSpotifyToken } from '../_shared/spotify-extended.ts';

const DEFAULT_PREWARM_LIMIT = 30;
const MAX_PREWARM_LIMIT = 40;
const MAX_RUNTIME_MS = 95_000;
const SPOTIFY_TOKEN_TIMEOUT_MS = 10_000;
const SPOTIFY_DETAILS_TIMEOUT_MS = 3_500;
const DB_STEP_TIMEOUT_MS = 8_000;
const MAX_CONSECUTIVE_SPOTIFY_SEARCH_FAILURES = 2;

type PrewarmSource = 'bootstrap' | 'lastfm' | 'mixed';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'unauthorized');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonError(500, 'missing_supabase_env');
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const limit = parseLimit(req.url);
  const artistOffset = parseArtistOffset(req.url);
  const source = parseSource(req.url);
  const includeBootstrap = source !== 'lastfm' && artistOffset === 0;
  const startedAt = Date.now();

  try {
    console.log(`[prewarm] start limit=${limit} artist_offset=${artistOffset} source=${source}`);
    const spotifyToken = await withTimeout(
      getServiceSpotifyToken(),
      SPOTIFY_TOKEN_TIMEOUT_MS,
      'spotify_token_timeout',
    );
    console.log('[prewarm] spotify_token_ok');
    const topAlbums =
      source !== 'bootstrap' && Date.now() - startedAt < MAX_RUNTIME_MS
        ? await withTimeout(
            fetchGloballyTopAlbums(limit, {
              artistOffset,
              topAlbumsForArtist: (artistName, albumLimit) =>
                getLastfmTopAlbumsCached(admin, artistName, albumLimit),
            }),
            30_000,
            'lastfm_batch_timeout',
          ).catch((e) => {
            console.warn(`[prewarm] lastfm_failed=${formatError(e)}`);
            return [];
          })
        : [];
    console.log(`[prewarm] lastfm_fetched=${topAlbums.length} artist_offset=${artistOffset}`);
    const seeds = mergeBootstrapSeeds(topAlbums, includeBootstrap);

    let inserted = 0;
    let attempted = 0;
    let consecutiveSpotifySearchFailures = 0;
    let stoppedReason: string | null = null;
    for (const item of seeds.slice(
      0,
      limit + (includeBootstrap ? BOOTSTRAP_FALLBACK_SEEDS.length : 0),
    )) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        stoppedReason = 'runtime_budget_exceeded';
        console.warn(
          `[prewarm] stopping_before_timeout attempted=${attempted} inserted=${inserted}`,
        );
        break;
      }
      attempted += 1;
      await new Promise((r) => setTimeout(r, 100));
      console.log(`[prewarm] attempt=${attempted} artist="${item.artist}" album="${item.name}"`);
      let sp: Awaited<ReturnType<typeof resolveSpotifyAlbumCached>>;
      try {
        sp = await resolveSpotifyAlbumCached(admin, spotifyToken, item.artist, item.name, {
          requestContext: 'prewarm_album_cache',
        });
      } catch (e) {
        console.warn(
          `[prewarm] spotify_search_failed artist="${item.artist}" album="${item.name}" error=${formatError(e)}`,
        );
        consecutiveSpotifySearchFailures += 1;
        if (consecutiveSpotifySearchFailures >= MAX_CONSECUTIVE_SPOTIFY_SEARCH_FAILURES) {
          stoppedReason = 'spotify_search_unavailable';
          console.warn(
            `[prewarm] stopping_spotify_search_unavailable consecutive_failures=${consecutiveSpotifySearchFailures}`,
          );
          break;
        }
        continue;
      }
      if (!sp) {
        consecutiveSpotifySearchFailures = 0;
        console.log(
          `[prewarm] spotify_search_no_match artist="${item.artist}" album="${item.name}"`,
        );
        continue;
      }
      consecutiveSpotifySearchFailures = 0;

      let durationMs: number | null = null;
      let releaseLike = isRecommendationReleaseLike(sp);
      if (!releaseLike && sp.total_tracks >= 2) {
        const details = await withTimeout(
          fetchAlbumDetails(spotifyToken, sp.id),
          SPOTIFY_DETAILS_TIMEOUT_MS,
          'spotify_album_details_timeout',
        ).catch((e) => {
          console.warn(
            `[prewarm] spotify_details_failed spotify_id=${sp.id} artist="${item.artist}" album="${item.name}" error=${formatError(e)}`,
          );
          return null;
        });
        durationMs = details?.duration_ms ?? null;
        releaseLike = isRecommendationReleaseLike({
          album_type: sp.album_type,
          total_tracks: sp.total_tracks,
          duration_ms: durationMs,
        });
      }
      if (!releaseLike) {
        console.log(
          `[prewarm] release_not_eligible spotify_id=${sp.id} type=${sp.album_type} tracks=${sp.total_tracks}`,
        );
        continue;
      }

      const upserted = await upsertAlbumSeed(supabaseUrl, serviceRoleKey, {
        spotify_id: sp.id,
        title: sp.name,
        primary_artist_name: sp.artists[0]?.name ?? item.artist,
        primary_artist_spotify_id: sp.artists[0]?.id ?? null,
        release_year: parseYear(sp.release_date),
        cover_url: sp.images[0]?.url ?? null,
        total_tracks: sp.total_tracks,
        duration_ms: durationMs,
        album_type: sp.album_type,
        lastfm_playcount: item.playcount ?? null,
        is_prewarm_seed: true,
        metadata_updated_at: new Date().toISOString(),
      }).catch((e) => {
        console.warn(
          `[prewarm] upsert_failed spotify_id=${sp.id} artist="${item.artist}" album="${item.name}" error=${formatError(e)}`,
        );
        return false;
      });

      if (upserted) inserted += 1;
      if (attempted % 25 === 0) {
        console.log(`[prewarm] progress attempted=${attempted} inserted=${inserted}`);
      }
    }

    console.log(`[prewarm] done attempted=${attempted} inserted=${inserted}`);
    return jsonResponse({
      ok: true,
      fetched: topAlbums.length,
      attempted,
      inserted,
      artist_offset: artistOffset,
      source,
      stopped_reason: stoppedReason,
    });
  } catch (e) {
    return jsonError(500, 'prewarm_failed', e instanceof Error ? e.message : String(e));
  }
});

function parseLimit(url: string) {
  const raw = new URL(url).searchParams.get('limit');
  const requested = raw ? Number(raw) : DEFAULT_PREWARM_LIMIT;
  if (!Number.isFinite(requested)) return DEFAULT_PREWARM_LIMIT;
  return Math.max(1, Math.min(MAX_PREWARM_LIMIT, Math.floor(requested)));
}

function parseArtistOffset(url: string) {
  const raw = new URL(url).searchParams.get('artist_offset');
  const requested = raw ? Number(raw) : 0;
  if (!Number.isFinite(requested)) return 0;
  return Math.max(0, Math.floor(requested));
}

function parseSource(url: string): PrewarmSource {
  const raw = new URL(url).searchParams.get('source');
  if (raw === 'lastfm' || raw === 'mixed' || raw === 'bootstrap') return raw;
  return 'mixed';
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

function formatError(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

type AlbumSeedRow = {
  spotify_id: string;
  title: string;
  primary_artist_name: string;
  primary_artist_spotify_id: string | null;
  release_year: number | null;
  cover_url: string | null;
  total_tracks: number;
  duration_ms: number | null;
  album_type: string;
  lastfm_playcount: number | null;
  is_prewarm_seed: boolean;
  metadata_updated_at: string;
};

async function upsertAlbumSeed(supabaseUrl: string, serviceRoleKey: string, row: AlbumSeedRow) {
  const res = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/albums?on_conflict=spotify_id`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    },
    DB_STEP_TIMEOUT_MS,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`album_upsert_failed:${res.status}:${body.slice(0, 200)}`);
  }
  return true;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseYear(d: string) {
  const y = Number(d?.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

const BOOTSTRAP_FALLBACK_SEEDS = [
  { artist: 'The Beatles', name: 'Abbey Road' },
  { artist: 'Miles Davis', name: 'Kind of Blue' },
  { artist: 'Joni Mitchell', name: 'Blue' },
  { artist: 'Radiohead', name: 'OK Computer' },
  { artist: 'Stevie Wonder', name: 'Songs in the Key of Life' },
  { artist: 'Nirvana', name: 'Nevermind' },
  { artist: 'Kendrick Lamar', name: 'To Pimp a Butterfly' },
  { artist: 'Kate Bush', name: 'Hounds of Love' },
  {
    artist: 'David Bowie',
    name: 'The Rise and Fall of Ziggy Stardust and the Spiders from Mars',
  },
  { artist: 'Aphex Twin', name: 'Selected Ambient Works 85-92' },
];

function mergeBootstrapSeeds(
  topAlbums: { artist: string; name: string; playcount?: number }[],
  includeBootstrap: boolean,
) {
  const seen = new Set<string>();
  const out: { artist: string; name: string; playcount?: number }[] = [];
  const seeds = includeBootstrap ? [...BOOTSTRAP_FALLBACK_SEEDS, ...topAlbums] : topAlbums;
  for (const item of seeds) {
    const key = `${item.artist.toLowerCase()}::${item.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
