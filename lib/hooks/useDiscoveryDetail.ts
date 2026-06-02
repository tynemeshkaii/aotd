import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import { type AlbumDiscovery, parseAlbumDiscovery } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

export const DISCOVERY_DETAIL_KEY = (userId?: string, aotdId?: string) => [
  'discovery-detail',
  userId,
  aotdId,
];

export function useDiscoveryDetail(aotdId?: string) {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const instanceId = useId();

  const query = useQuery({
    queryKey: DISCOVERY_DETAIL_KEY(userId, aotdId),
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

  useEffect(() => {
    if (!userId || !aotdId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: DISCOVERY_DETAIL_KEY(userId, aotdId) });
    };

    const channel = supabase
      .channel(`discovery-detail-${userId}-${aotdId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'albums_of_the_day',
          filter: `user_id=eq.${userId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ratings',
          filter: `user_id=eq.${userId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, aotdId, qc, instanceId]);

  return query;
}
