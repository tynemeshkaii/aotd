import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export type LibraryItem = {
  id: string;
  provider_album_id: string;
  album_name: string;
  artist_name: string;
  cover_url: string | null;
  added_at_provider: string | null;
};

export function useLibrary(searchQuery = '') {
  const { session } = useSession();
  const userId = session?.user.id;
  const term = searchQuery.trim();

  return useQuery({
    queryKey: ['library', userId, term],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error('missing_user_id');
      let q = supabase
        .from('user_library_active')
        .select('id, provider_album_id, album_name, artist_name, cover_url, added_at_provider')
        .eq('user_id', userId)
        .order('added_at_provider', { ascending: false, nullsFirst: false })
        .limit(1000);

      if (term) {
        const like = `%${term}%`;
        q = q.or(`album_name.ilike.${like},artist_name.ilike.${like}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      // View columns are typed as nullable by Supabase typegen even though the
      // base table enforces NOT NULL — narrow here for downstream components.
      const rows: LibraryItem[] = (data ?? [])
        .filter(
          (
            r,
          ): r is typeof r & {
            id: string;
            provider_album_id: string;
            album_name: string;
            artist_name: string;
          } => !!r.id && !!r.provider_album_id && !!r.album_name && !!r.artist_name,
        )
        .map((r) => ({
          id: r.id,
          provider_album_id: r.provider_album_id,
          album_name: r.album_name,
          artist_name: r.artist_name,
          cover_url: r.cover_url,
          added_at_provider: r.added_at_provider,
        }));
      return rows;
    },
  });
}
