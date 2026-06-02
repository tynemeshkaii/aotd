import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import { useUserRealtimeInvalidation } from '@/lib/hooks/useUserRealtimeInvalidation';
import { type AlbumDiscovery, parseAlbumDiscovery } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

export const DISCOVERY_DETAIL_KEY = (userId?: string, aotdId?: string) => [
  'discovery-detail',
  userId,
  aotdId,
];
const DISCOVERY_DETAIL_REALTIME_TABLES = ['albums_of_the_day', 'ratings'];

export function useDiscoveryDetail(aotdId?: string) {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryKey = useMemo(() => DISCOVERY_DETAIL_KEY(userId, aotdId), [userId, aotdId]);

  const query = useQuery({
    queryKey,
    enabled: !!userId && !!aotdId,
    queryFn: async (): Promise<AlbumDiscovery | null> => {
      if (!userId || !aotdId) throw new Error('missing_discovery_detail_args');
      const { data, error } = await supabase.rpc('get_discovery_detail', {
        p_user_id: userId,
        p_aotd_id: aotdId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? parseAlbumDiscovery(row) : null;
    },
  });

  useUserRealtimeInvalidation({
    channelPrefix: `discovery-detail-${aotdId ?? 'missing'}`,
    userId: aotdId ? userId : undefined,
    tables: DISCOVERY_DETAIL_REALTIME_TABLES,
    queryKey,
  });

  return query;
}
