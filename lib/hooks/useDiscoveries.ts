import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import { type AlbumDiscovery, parseAlbumDiscoveries } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

const DEFAULT_DISCOVERIES_LIMIT = 120;

type UseDiscoveriesOptions = {
  limit?: number;
  offset?: number;
};

export const DISCOVERIES_KEY = (userId?: string, limit?: number, offset?: number) => [
  'discoveries',
  userId,
  limit,
  offset,
];

export function useDiscoveries(options: UseDiscoveriesOptions = {}) {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const instanceId = useId();
  const limit = options.limit ?? DEFAULT_DISCOVERIES_LIMIT;
  const offset = options.offset ?? 0;

  const query = useQuery({
    queryKey: DISCOVERIES_KEY(userId, limit, offset),
    enabled: !!userId,
    queryFn: async (): Promise<AlbumDiscovery[]> => {
      if (!userId) throw new Error('missing_user_id');
      const { data, error } = await supabase.rpc('get_discoveries', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      return parseAlbumDiscoveries(data ?? []);
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
