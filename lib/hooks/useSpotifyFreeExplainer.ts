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

    let alreadyDismissed = false;
    try {
      const key = dismissedKey(userId);
      alreadyDismissed = (await SecureStore.getItemAsync(key)) != null;
      if (!alreadyDismissed) {
        // Persist the flag before showing so a storage failure can't make us
        // nag on every open — but never let storage failure block the alert.
        await SecureStore.setItemAsync(key, '1');
      }
    } catch (error) {
      console.warn('Could not persist Spotify Free explainer flag', error);
    }

    if (alreadyDismissed) return;

    // Wait for the user to acknowledge before the caller opens Spotify —
    // otherwise the app backgrounds into Spotify the instant the alert appears
    // and the heads-up is never actually seen.
    await new Promise<void>((resolve) => {
      Alert.alert(
        'Small Spotify heads-up',
        'Free Spotify may shuffle albums instead of playing them in order. Premium usually keeps the record behaving like a record.',
        [{ text: 'Got it', onPress: () => resolve() }],
        { onDismiss: () => resolve() },
      );
    });
  };

  return { maybeShow, spotifyProduct: query.data };
}
