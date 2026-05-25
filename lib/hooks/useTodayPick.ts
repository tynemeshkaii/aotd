import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import type { TodayPick } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

const TODAY_KEY = (userId?: string) => ['today-pick', userId];

export function useTodayPick() {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const instanceId = useId();

  const query = useQuery({
    queryKey: TODAY_KEY(userId),
    enabled: !!userId,
    queryFn: async (): Promise<TodayPick | null> => {
      if (!userId) throw new Error('missing_user_id');
      // IMPORTANT: do not detach `supabase.rpc` into a local variable — losing
      // the `this` binding crashes at runtime with
      // "Cannot read property 'rest' of undefined". Always call inline.
      const { data, error } = await supabase.rpc('get_current_pick', {
        p_user_id: userId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      // The generated RPC return type is looser than TodayPick (nullable
      // columns appear as non-null, status is a free string, selection_reason
      // is Json). Narrow at the boundary.
      return (row ?? null) as TodayPick | null;
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`today-pick-${userId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'albums_of_the_day',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: TODAY_KEY(userId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc, instanceId]);

  return query;
}
