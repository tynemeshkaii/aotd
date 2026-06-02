import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export type TopArtist = { name: string; count: number };
export type DecadeBucket = { decade: number; count: number };

export type ProfileOverview = {
  streak: number;
  total_discovered: number;
  taste: {
    top_artists: TopArtist[];
    decades: DecadeBucket[];
    span_min: number | null;
    span_max: number | null;
  };
  listening: {
    rated_this_month: number;
    loved_count: number;
    avg_score: number | null;
    total_rated: number;
  };
  library_stats: {
    albums_tracked: number | null;
    last_synced_at: string | null;
  };
};

export const PROFILE_OVERVIEW_KEY = (userId?: string) => ['profile-overview', userId];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTopArtist(value: unknown): value is TopArtist {
  return isRecord(value) && typeof value.name === 'string' && typeof value.count === 'number';
}

function isDecadeBucket(value: unknown): value is DecadeBucket {
  return isRecord(value) && typeof value.decade === 'number' && typeof value.count === 'number';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function parseProfileOverview(value: unknown): ProfileOverview {
  if (!isRecord(value) || !isRecord(value.taste) || !isRecord(value.listening)) {
    throw new Error('invalid_profile_overview_shape');
  }

  const topArtists = value.taste.top_artists;
  const decades = value.taste.decades;

  if (
    typeof value.streak !== 'number' ||
    typeof value.total_discovered !== 'number' ||
    !Array.isArray(topArtists) ||
    !topArtists.every(isTopArtist) ||
    !Array.isArray(decades) ||
    !decades.every(isDecadeBucket) ||
    !isNullableNumber(value.taste.span_min) ||
    !isNullableNumber(value.taste.span_max) ||
    typeof value.listening.rated_this_month !== 'number' ||
    typeof value.listening.loved_count !== 'number' ||
    !isNullableNumber(value.listening.avg_score) ||
    typeof value.listening.total_rated !== 'number'
  ) {
    throw new Error('invalid_profile_overview_shape');
  }

  const libraryStats = isRecord(value.library_stats)
    ? {
        albums_tracked: isNullableNumber(value.library_stats.albums_tracked)
          ? value.library_stats.albums_tracked
          : null,
        last_synced_at: isNullableString(value.library_stats.last_synced_at)
          ? value.library_stats.last_synced_at
          : null,
      }
    : { albums_tracked: null, last_synced_at: null };

  return {
    ...value,
    library_stats: libraryStats,
  } as ProfileOverview;
}

export function useProfileOverview() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryKey = PROFILE_OVERVIEW_KEY(userId);

  return useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<ProfileOverview> => {
      if (!userId) {
        throw new Error('missing_user_id');
      }

      // `get_profile_overview` returns jsonb (typed as Json in database.ts).
      // Call inline; never detach supabase.rpc from the client.
      const { data, error } = await supabase.rpc('get_profile_overview', {
        p_user_id: userId,
      });

      if (error) {
        throw error;
      }

      return parseProfileOverview(data);
    },
  });
}
