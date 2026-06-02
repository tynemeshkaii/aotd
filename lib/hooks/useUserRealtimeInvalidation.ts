import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { supabase } from '@/lib/supabase';

type UserRealtimeInvalidationOptions = {
  channelPrefix: string;
  userId?: string;
  tables: string[];
  queryKey: QueryKey;
};

export function useUserRealtimeInvalidation({
  channelPrefix,
  userId,
  tables,
  queryKey,
}: UserRealtimeInvalidationOptions) {
  const qc = useQueryClient();
  const instanceId = useId();

  useEffect(() => {
    if (!userId) return;

    let channel = supabase.channel(`${channelPrefix}-${userId}-${instanceId}`);
    const invalidate = () => {
      qc.invalidateQueries({ queryKey });
    };

    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `user_id=eq.${userId}`,
        },
        invalidate,
      );
    }

    const subscription = channel.subscribe();
    return () => {
      supabase.removeChannel(subscription);
    };
  }, [channelPrefix, userId, instanceId, qc, tables, queryKey]);
}
