import type { SupabaseClient } from '@supabase/supabase-js';
import { getAudioFeaturesCached } from './external-cache.ts';
import { fetchUserTopTracksOptional } from './spotify-extended.ts';

export interface UserArtist {
  spotify_id: string | null;
  name: string;
  frequency: number;
}

export interface TasteSignal {
  topArtists: UserArtist[];
  tasteVector: TasteVector | null;
  librarySize: number;
  libraryDecadeFractions: Record<string, number>;
}

export interface TasteVector {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  tempo: number;
}

type ExtractTasteSignalOpts = {
  includeTasteVector?: boolean;
};

export async function extractTasteSignal(
  admin: SupabaseClient,
  userId: string,
  spotifyToken: string,
  opts: ExtractTasteSignalOpts = {},
): Promise<TasteSignal> {
  const includeTasteVector = opts.includeTasteVector ?? true;
  const { data: lib } = await admin
    .from('user_library')
    .select('artist_name, primary_artist_spotify_id, release_year')
    .eq('user_id', userId)
    .is('removed_at', null);

  type ArtistAgg = { spotify_id: string | null; name: string; frequency: number };
  const byKey = new Map<string, ArtistAgg>();
  for (const row of lib ?? []) {
    const id: string | null = row.primary_artist_spotify_id ?? null;
    const key = id ?? row.artist_name.toLowerCase().trim();
    const existing = byKey.get(key);
    if (existing) {
      existing.frequency += 1;
    } else {
      byKey.set(key, { spotify_id: id, name: row.artist_name, frequency: 1 });
    }
  }
  const topArtists = [...byKey.values()].sort((a, b) => b.frequency - a.frequency).slice(0, 50);

  const decadeCounts: Record<string, number> = {};
  let totalWithYear = 0;
  for (const row of lib ?? []) {
    if (row.release_year && Number.isFinite(row.release_year)) {
      const decade = String(Math.floor(row.release_year / 10) * 10);
      decadeCounts[decade] = (decadeCounts[decade] ?? 0) + 1;
      totalWithYear += 1;
    }
  }
  const libraryDecadeFractions: Record<string, number> = {};
  if (totalWithYear > 0) {
    for (const [decade, count] of Object.entries(decadeCounts)) {
      libraryDecadeFractions[decade] = count / totalWithYear;
    }
  }

  let tasteVector: TasteVector | null = null;
  if (includeTasteVector) {
    const topTracks = await fetchUserTopTracksOptional(spotifyToken, 50);
    if (topTracks.length >= 10) {
      const trackIds = topTracks.map((t) => t.id);
      const featuresMap = await getAudioFeaturesCached(admin, spotifyToken, trackIds);
      const available = Object.values(featuresMap);
      if (available.length >= 10) {
        tasteVector = averageFeatures(available);
      }
    }
  }

  return {
    topArtists,
    tasteVector,
    librarySize: lib?.length ?? 0,
    libraryDecadeFractions,
  };
}

function averageFeatures(arr: TasteVector[]): TasteVector {
  const n = arr.length;
  const sum = arr.reduce(
    (a, f) => ({
      energy: a.energy + f.energy,
      valence: a.valence + f.valence,
      danceability: a.danceability + f.danceability,
      acousticness: a.acousticness + f.acousticness,
      instrumentalness: a.instrumentalness + f.instrumentalness,
      tempo: a.tempo + f.tempo,
    }),
    { energy: 0, valence: 0, danceability: 0, acousticness: 0, instrumentalness: 0, tempo: 0 },
  );
  return {
    energy: sum.energy / n,
    valence: sum.valence / n,
    danceability: sum.danceability / n,
    acousticness: sum.acousticness / n,
    instrumentalness: sum.instrumentalness / n,
    tempo: sum.tempo / n,
  };
}
