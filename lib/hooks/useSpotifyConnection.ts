import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function useSpotifyConnection() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['streaming-connection', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error('missing_user_id');

      const { data, error } = await supabase
        .from('streaming_connections_safe')
        .select('provider, connected_at, spotify_product')
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });
}
