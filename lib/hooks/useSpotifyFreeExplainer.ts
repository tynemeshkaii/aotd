import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

const dismissedKey = (userId: string) => `aotd_spotify_free_explainer_dismissed_${userId}`;

export function useSpotifyFreeExplainer() {
  const { session } = useSession();
  const userId = session?.user.id;

  const query = useQuery({
    queryKey: ['spotify-product', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error('missing_user_id');
      const { data, error } = await supabase
        .from('streaming_connections_safe')
        .select('spotify_product')
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .maybeSingle();
      if (error) throw error;
      return data?.spotify_product ?? null;
    },
  });

  const maybeShow = async () => {
    if (!userId || (query.data !== 'free' && query.data !== 'open')) return;

    try {
      const key = dismissedKey(userId);
      const dismissed = await SecureStore.getItemAsync(key);
      if (dismissed) return;

      await SecureStore.setItemAsync(key, '1');
      Alert.alert(
        'Small Spotify heads-up',
        'Free Spotify may shuffle albums instead of playing them in order. Premium usually keeps the record behaving like a record.',
      );
    } catch (error) {
      console.warn('Could not persist Spotify Free explainer flag', error);
    }
  };

  return { maybeShow, spotifyProduct: query.data };
}
