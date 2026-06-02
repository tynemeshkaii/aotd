import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertExternalApiCircuitAllows,
  recordExternalApiCircuitFailure,
  recordExternalApiCircuitSuccess,
} from './external-api-breaker.ts';
import { recordExternalApiCall } from './external-api-log.ts';
import { reserveExternalApiSlot } from './external-api-rate-limit.ts';

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_RATE_LIMIT_MS = 1100;
const MB_CACHE_TTL_DAYS = 180;
const MB_ARTIST_LOOKUP_TIMEOUT_MS = 2_000;
const MB_ARTIST_LOOKUP_COOLDOWN_SECONDS = 15 * 60;
let mbLastCallAt = 0;

async function mbThrottle() {
  const elapsed = Date.now() - mbLastCallAt;
  if (elapsed < MB_RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, MB_RATE_LIMIT_MS - elapsed));
  }
  mbLastCallAt = Date.now();
}

export type MbReleaseGroup = {
  id: string;
  primary_type?: string;
  secondary_types?: string[];
  first_release_date?: string;
  artist?: {
    id: string;
    name?: string;
  };
};

type MusicBrainzReleaseGroup = {
  id: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  'artist-credit'?: {
    artist?: {
      id?: string;
      name?: string;
    };
  }[];
};

type MusicBrainzArtist = {
  id?: string;
  name?: string;
  country?: string | null;
  area?: {
    'iso-3166-1-codes'?: string[];
  } | null;
  'begin-area'?: {
    'iso-3166-1-codes'?: string[];
  } | null;
};

export async function getReleaseGroupCached(
  admin: SupabaseClient,
  artist: string,
  album: string,
): Promise<MbReleaseGroup | null> {
  const normalizedArtist = normalizeLookup(artist);
  const normalizedAlbum = normalizeLookup(album);

  const { data: cached } = await admin
    .from('musicbrainz_release_group_cache')
    .select(
      'release_group_id, primary_type, secondary_types, first_release_date, mb_artist_id, mb_artist_name, artist_credit_resolved, fetched_at',
    )
    .eq('normalized_artist', normalizedArtist)
    .eq('normalized_album', normalizedAlbum)
    .maybeSingle();

  if (
    cached &&
    !isStale(cached.fetched_at, MB_CACHE_TTL_DAYS) &&
    (!cached.release_group_id || cached.artist_credit_resolved)
  ) {
    if (!cached.release_group_id) return null;
    return {
      id: cached.release_group_id,
      primary_type: cached.primary_type ?? undefined,
      secondary_types: cached.secondary_types ?? [],
      first_release_date: cached.first_release_date ?? undefined,
      artist: cached.mb_artist_id
        ? { id: cached.mb_artist_id, name: cached.mb_artist_name ?? undefined }
        : undefined,
    };
  }

  const fresh = await fetchReleaseGroup(admin, artist, album);
  await admin.from('musicbrainz_release_group_cache').upsert(
    {
      normalized_artist: normalizedArtist,
      normalized_album: normalizedAlbum,
      release_group_id: fresh?.id ?? null,
      primary_type: fresh?.primary_type ?? null,
      secondary_types: fresh?.secondary_types ?? [],
      first_release_date: fresh?.first_release_date ?? null,
      mb_artist_id: fresh?.artist?.id ?? null,
      mb_artist_name: fresh?.artist?.name ?? null,
      artist_credit_resolved: true,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'normalized_artist,normalized_album' },
  );

  return fresh;
}

async function fetchReleaseGroup(
  admin: SupabaseClient,
  artist: string,
  album: string,
): Promise<MbReleaseGroup | null> {
  const startedAt = Date.now();
  try {
    await mbThrottle();
    await reserveExternalApiSlot(admin, 'musicbrainz', 'release_group_search', MB_RATE_LIMIT_MS);
    const q = `release:"${album.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`;
    const res = await fetch(
      `${MB_BASE}/release-group?query=${encodeURIComponent(q)}&fmt=json&limit=1`,
      {
        headers: {
          'User-Agent': Deno.env.get('MUSICBRAINZ_USER_AGENT') ?? 'AlbumOfTheDay/1.0',
        },
      },
    );
    await recordExternalApiCall(admin, {
      service: 'musicbrainz',
      endpoint: 'release_group_search',
      status: res.status,
      ok: res.ok,
      duration_ms: Date.now() - startedAt,
      error_code: res.ok ? null : `musicbrainz_failed:${res.status}`,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      'release-groups'?: MusicBrainzReleaseGroup[];
    };
    const rg = data['release-groups']?.[0];
    if (!rg) return null;
    return {
      id: rg.id,
      primary_type: rg['primary-type'],
      secondary_types: rg['secondary-types'] ?? [],
      first_release_date: rg['first-release-date'],
      artist: toMbArtistSummary(rg),
    };
  } catch (e) {
    await recordExternalApiCall(admin, {
      service: 'musicbrainz',
      endpoint: 'release_group_search',
      ok: false,
      duration_ms: Date.now() - startedAt,
      error_code: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function getArtistCountryCached(
  admin: SupabaseClient,
  artist: MbReleaseGroup['artist'] | null | undefined,
): Promise<string | null> {
  if (!artist?.id) return null;

  const { data: cached } = await admin
    .from('mb_artist_cache')
    .select('country, resolved, fetched_at')
    .eq('mb_artist_id', artist.id)
    .maybeSingle();

  if (cached?.resolved && !isStale(cached.fetched_at, MB_CACHE_TTL_DAYS)) {
    return cached.country ?? null;
  }

  const fresh = await fetchArtistCountry(admin, artist.id);
  const country = fresh?.country ?? null;
  const name = fresh?.name ?? artist.name ?? null;

  if (fresh) {
    await admin.from('mb_artist_cache').upsert(
      {
        mb_artist_id: artist.id,
        name,
        country,
        resolved: true,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'mb_artist_id' },
    );
    return country;
  }

  return cached?.country ?? null;
}

async function fetchArtistCountry(
  admin: SupabaseClient,
  artistId: string,
): Promise<{ name: string | null; country: string | null } | null> {
  const startedAt = Date.now();
  const endpoint = 'artist_lookup';
  try {
    await assertExternalApiCircuitAllows(admin, 'musicbrainz', endpoint);
    await mbThrottle();
    await reserveExternalApiSlot(admin, 'musicbrainz', endpoint, MB_RATE_LIMIT_MS);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MB_ARTIST_LOOKUP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${MB_BASE}/artist/${artistId}?fmt=json`, {
        signal: controller.signal,
        headers: {
          'User-Agent': Deno.env.get('MUSICBRAINZ_USER_AGENT') ?? 'AlbumOfTheDay/1.0',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
    await recordExternalApiCall(admin, {
      service: 'musicbrainz',
      endpoint,
      status: res.status,
      ok: res.ok,
      duration_ms: Date.now() - startedAt,
      error_code: res.ok ? null : `musicbrainz_failed:${res.status}`,
    });
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) {
        await recordExternalApiCircuitFailure(admin, 'musicbrainz', endpoint, {
          status: res.status,
          error: `musicbrainz_failed:${res.status}`,
          cooldownSeconds: MB_ARTIST_LOOKUP_COOLDOWN_SECONDS,
        });
      }
      return null;
    }

    await recordExternalApiCircuitSuccess(admin, 'musicbrainz', endpoint);
    const data = (await res.json()) as MusicBrainzArtist;
    return {
      name: data.name ?? null,
      country: normalizeCountryCode(
        data.country ??
          data.area?.['iso-3166-1-codes']?.[0] ??
          data['begin-area']?.['iso-3166-1-codes']?.[0] ??
          null,
      ),
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordExternalApiCall(admin, {
      service: 'musicbrainz',
      endpoint,
      ok: false,
      duration_ms: Date.now() - startedAt,
      error_code: error,
    });
    if (!error.includes('circuit_open')) {
      await recordExternalApiCircuitFailure(admin, 'musicbrainz', endpoint, {
        status: null,
        error,
        cooldownSeconds: MB_ARTIST_LOOKUP_COOLDOWN_SECONDS,
      });
    }
    return null;
  }
}

const EXCLUDED_SECONDARY_TYPES = new Set(['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix']);

const ALLOWED_PRIMARY_TYPES = new Set(['Album', 'EP']);

export function isAlbumLike(rg: MbReleaseGroup | null): boolean {
  if (!rg) return true;
  if (rg.primary_type && !ALLOWED_PRIMARY_TYPES.has(rg.primary_type)) {
    return false;
  }
  return !(rg.secondary_types ?? []).some((t) => EXCLUDED_SECONDARY_TYPES.has(t));
}

function normalizeLookup(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function toMbArtistSummary(rg: MusicBrainzReleaseGroup): MbReleaseGroup['artist'] | undefined {
  const artist = rg['artist-credit']?.[0]?.artist;
  if (!artist?.id) return undefined;
  return { id: artist.id, name: artist.name };
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function isStale(fetchedAt: string, ttlDays: number) {
  return Date.now() - new Date(fetchedAt).getTime() > ttlDays * 24 * 60 * 60 * 1000;
}
