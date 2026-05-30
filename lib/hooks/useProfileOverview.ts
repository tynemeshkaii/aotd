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
};

export function useProfileOverview() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['profile-overview', userId],
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

      return data as unknown as ProfileOverview;
    },
  });
}
