import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import { useUserRealtimeInvalidation } from '@/lib/hooks/useUserRealtimeInvalidation';
import { supabase } from '@/lib/supabase';

export const UNRATED_PAST_PICK_COUNT_KEY = (userId?: string, excludeAotdId?: string) => [
  'unrated-past-pick-count',
  userId,
  excludeAotdId,
];
const UNRATED_PAST_PICK_COUNT_REALTIME_TABLES = ['albums_of_the_day'];

export function useUnratedPastPickCount(excludeAotdId?: string) {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryKey = useMemo(
    () => UNRATED_PAST_PICK_COUNT_KEY(userId, excludeAotdId),
    [userId, excludeAotdId],
  );

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      if (!userId) throw new Error('missing_user_id');

      const { data, error } = await supabase.rpc(
        'get_unrated_past_pick_count' as never,
        {
          p_user_id: userId,
          p_exclude_aotd_id: excludeAotdId ?? null,
        } as never,
      );

      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
  });

  useUserRealtimeInvalidation({
    channelPrefix: 'unrated-past-pick-count',
    userId,
    tables: UNRATED_PAST_PICK_COUNT_REALTIME_TABLES,
    queryKey,
  });

  return query;
}
