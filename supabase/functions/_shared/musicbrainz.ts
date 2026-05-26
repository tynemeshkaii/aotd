import type { SupabaseClient } from '@supabase/supabase-js';

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_RATE_LIMIT_MS = 1100;
const MB_CACHE_TTL_DAYS = 180;
let mbLastCallAt = 0;

async function mbThrottle() {
  const elapsed = Date.now() - mbLastCallAt;
  if (elapsed < MB_RATE_LIMIT_MS)
    await new Promise((r) => setTimeout(r, MB_RATE_LIMIT_MS - elapsed));
  mbLastCallAt = Date.now();
}

export type MbReleaseGroup = {
  id: string;
  primary_type?: string;
  secondary_types?: string[];
  first_release_date?: string;
};

type MusicBrainzReleaseGroup = {
  id: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
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
    .select('release_group_id, primary_type, secondary_types, first_release_date, fetched_at')
    .eq('normalized_artist', normalizedArtist)
    .eq('normalized_album', normalizedAlbum)
    .maybeSingle();

  if (cached && !isStale(cached.fetched_at, MB_CACHE_TTL_DAYS)) {
    if (!cached.release_group_id) return null;
    return {
      id: cached.release_group_id,
      primary_type: cached.primary_type ?? undefined,
      secondary_types: cached.secondary_types ?? [],
      first_release_date: cached.first_release_date ?? undefined,
    };
  }

  const fresh = await fetchReleaseGroup(artist, album);
  await admin.from('musicbrainz_release_group_cache').upsert(
    {
      normalized_artist: normalizedArtist,
      normalized_album: normalizedAlbum,
      release_group_id: fresh?.id ?? null,
      primary_type: fresh?.primary_type ?? null,
      secondary_types: fresh?.secondary_types ?? [],
      first_release_date: fresh?.first_release_date ?? null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'normalized_artist,normalized_album' },
  );

  return fresh;
}

async function fetchReleaseGroup(artist: string, album: string): Promise<MbReleaseGroup | null> {
  try {
    await mbThrottle();
    const q = `release:"${album.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`;
    const res = await fetch(
      `${MB_BASE}/release-group?query=${encodeURIComponent(q)}&fmt=json&limit=1`,
      {
        headers: { 'User-Agent': Deno.env.get('MUSICBRAINZ_USER_AGENT') ?? 'AlbumOfTheDay/1.0' },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { 'release-groups'?: MusicBrainzReleaseGroup[] };
    const rg = data['release-groups']?.[0];
    if (!rg) return null;
    return {
      id: rg.id,
      primary_type: rg['primary-type'],
      secondary_types: rg['secondary-types'] ?? [],
      first_release_date: rg['first-release-date'],
    };
  } catch {
    return null;
  }
}

const EXCLUDED_SECONDARY_TYPES = new Set(['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix']);

const ALLOWED_PRIMARY_TYPES = new Set(['Album', 'EP']);

export function isAlbumLike(rg: MbReleaseGroup | null): boolean {
  if (!rg) return true;
  if (rg.primary_type && !ALLOWED_PRIMARY_TYPES.has(rg.primary_type)) return false;
  return !(rg.secondary_types ?? []).some((t) => EXCLUDED_SECONDARY_TYPES.has(t));
}

function normalizeLookup(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function isStale(fetchedAt: string, ttlDays: number) {
  return Date.now() - new Date(fetchedAt).getTime() > ttlDays * 24 * 60 * 60 * 1000;
}
