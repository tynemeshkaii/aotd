import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Linking } from 'react-native';

import { useSession } from '@/components/auth/AuthProvider';
import { DISCOVERIES_KEY } from '@/lib/hooks/useDiscoveries';
import { DISCOVERY_DETAIL_KEY } from '@/lib/hooks/useDiscoveryDetail';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { spotifyAlbumUri, spotifyAlbumUrl } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

export function useOpenAlbum(album: AlbumDiscovery) {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const uri = spotifyAlbumUri(album.album_spotify_id);
      const url = spotifyAlbumUrl(album.album_spotify_id);
      let target = url;

      try {
        if (await Linking.canOpenURL(uri)) {
          target = uri;
        }
      } catch (error) {
        console.warn('Could not check Spotify app URL support', error);
      }

      await Linking.openURL(target);

      if (userId && album.status === 'pending') {
        const { error } = await supabase
          .from('albums_of_the_day')
          .update({ status: 'opened' })
          .eq('id', album.aotd_id)
          .eq('user_id', userId);

        if (error) {
          console.warn('Could not mark album opened', error.message);
        } else {
          qc.invalidateQueries({ queryKey: ['today-pick', userId] });
          qc.invalidateQueries({ queryKey: DISCOVERIES_KEY(userId) });
          qc.invalidateQueries({ queryKey: DISCOVERY_DETAIL_KEY(userId, album.aotd_id) });
        }
      }
    },
    onError: () => {
      Alert.alert('Could not open Spotify right now.');
    },
  });
}
