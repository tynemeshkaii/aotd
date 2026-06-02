import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export const UNRATED_PAST_PICK_COUNT_KEY = (userId?: string, excludeAotdId?: string) => [
  'unrated-past-pick-count',
  userId,
  excludeAotdId,
];

export function useUnratedPastPickCount(excludeAotdId?: string) {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const instanceId = useId();

  const query = useQuery({
    queryKey: UNRATED_PAST_PICK_COUNT_KEY(userId, excludeAotdId),
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

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`unrated-past-pick-count-${userId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'albums_of_the_day',
          filter: `user_id=eq.${userId}`,
        },
        () =>
          qc.invalidateQueries({
            queryKey: UNRATED_PAST_PICK_COUNT_KEY(userId, excludeAotdId),
          }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, excludeAotdId, qc, instanceId]);

  return query;
}
