import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function useLibraryStats() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['library-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) {
        throw new Error('missing_user_id');
      }

      const { data: status, error: statusError } = await supabase
        .from('library_sync_status')
        .select('aggregated_albums_count')
        .eq('user_id', userId)
        .maybeSingle();

      if (statusError) {
        throw statusError;
      }

      const { data: connection, error: connectionError } = await supabase
        .from('streaming_connections_safe')
        .select('last_synced_at')
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .maybeSingle();

      if (connectionError) {
        throw connectionError;
      }

      return {
        albumsTracked: status?.aggregated_albums_count ?? null,
        lastSyncedAt: connection?.last_synced_at ?? null,
      };
    },
  });
}
