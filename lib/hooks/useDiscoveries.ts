import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import { useUserRealtimeInvalidation } from '@/lib/hooks/useUserRealtimeInvalidation';
import { type AlbumDiscovery, parseAlbumDiscoveries } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

const DEFAULT_DISCOVERIES_LIMIT = 120;
const DISCOVERIES_REALTIME_TABLES = ['albums_of_the_day', 'ratings'];

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
  const limit = options.limit ?? DEFAULT_DISCOVERIES_LIMIT;
  const offset = options.offset ?? 0;
  const queryKey = useMemo(() => DISCOVERIES_KEY(userId, limit, offset), [userId, limit, offset]);
  const realtimeQueryKey = useMemo(() => DISCOVERIES_KEY(userId), [userId]);

  const query = useQuery({
    queryKey,
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

  useUserRealtimeInvalidation({
    channelPrefix: 'discoveries',
    userId,
    tables: DISCOVERIES_REALTIME_TABLES,
    queryKey: realtimeQueryKey,
  });

  return query;
}
