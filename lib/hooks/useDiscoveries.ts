import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

export const DISCOVERIES_KEY = (userId?: string) => ['discoveries', userId];

export function useDiscoveries() {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const instanceId = useId();

  const query = useQuery({
    queryKey: DISCOVERIES_KEY(userId),
    enabled: !!userId,
    queryFn: async (): Promise<AlbumDiscovery[]> => {
      if (!userId) throw new Error('missing_user_id');
      const { data, error } = await supabase.rpc('get_discoveries', {
        p_user_id: userId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AlbumDiscovery[];
    },
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`discoveries-${userId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'albums_of_the_day',
          filter: `user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: DISCOVERIES_KEY(userId) }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ratings',
          filter: `user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: DISCOVERIES_KEY(userId) }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc, instanceId]);

  return query;
}
