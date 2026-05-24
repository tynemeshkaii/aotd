import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type SyncStatus = Database['public']['Tables']['library_sync_status']['Row'];

export function useLibrarySyncStatus(): { status: SyncStatus | null; loading: boolean } {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const queryKey = useMemo(() => ['library-sync-status', userId], [userId]);
  // Per-instance suffix: supabase-js reuses channels by name, so multiple
  // mounts (SyncBanner on Home + Library + Profile) share one channel and the
  // second `.on()` call throws. A unique name gives each mount its own
  // subscription — negligible overhead for one row per user.
  const instanceId = useId();

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error('missing_user_id');
      const { data, error } = await supabase
        .from('library_sync_status')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SyncStatus | null;
    },
    // Polling fallback if Realtime can't connect (Expo Go firewall / websocket).
    // Only active while a sync is actually running.
    refetchInterval: (query) => {
      const s = query.state.data as SyncStatus | null;
      return s && (s.status === 'queued' || s.status === 'syncing') ? 2000 : false;
    },
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`sync-status-${userId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'library_sync_status',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as SyncStatus | null;
          if (next) {
            qc.setQueryData(queryKey, next);
            qc.invalidateQueries({ queryKey: ['library-stats', userId] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc, queryKey, instanceId]);

  return { status: data ?? null, loading: isLoading };
}
