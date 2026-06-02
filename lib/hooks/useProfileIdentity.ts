import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function useProfileIdentity() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error('missing_user_id');

      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    },
  });
}
