import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Alert, Image, Platform, Share, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { AlbumActions } from '@/components/album/AlbumActions';
import { AlbumHero } from '@/components/album/AlbumHero';
import { RatingEditor } from '@/components/album/RatingEditor';
import { ShareCard } from '@/components/album/ShareCard';
import { WhyThisAlbum } from '@/components/album/WhyThisAlbum';
import { Text } from '@/components/ui/Text';
import { useOpenAlbum } from '@/lib/hooks/useOpenAlbum';
import { useSpotifyFreeExplainer } from '@/lib/hooks/useSpotifyFreeExplainer';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { spotifyAlbumUrl } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
  isToday?: boolean;
};

export function AlbumDetail({ album, isToday }: Props) {
  const shareCardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const openAlbum = useOpenAlbum(album);
  const freeExplainer = useSpotifyFreeExplainer();

  const open = async () => {
    await freeExplainer.maybeShow();
    openAlbum.mutate();
  };

  const share = async () => {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert('Sharing is not available on this device.');
      return;
    }

    if (!shareCardRef.current) {
      Alert.alert('Could not build the share card.');
      return;
    }

    try {
      setSharing(true);

      if (album.album_cover_url) {
        try {
          await Image.prefetch(album.album_cover_url);
        } catch (error) {
          console.warn('Could not prefetch album cover before sharing', error);
        }
      }

      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
      });

      const message = `My album of the day: ${album.album_primary_artist_name} - ${album.album_title} ${spotifyAlbumUrl(album.album_spotify_id)}`;

      if (Platform.OS === 'ios') {
        await Share.share(
          {
            url: uri,
            message,
          },
          {
            subject: 'Album of the Day',
          },
        );
      } else {
        await Sharing.shareAsync(uri, {
          dialogTitle: message,
          mimeType: 'image/png',
          UTI: 'public.png',
        });
      }
    } catch (error) {
      console.warn('Could not share album card', error);
      Alert.alert('Could not build the share card.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View className="gap-5">
      {isToday && (
        <Text variant="caption" className="uppercase">
          Today's album
        </Text>
      )}

      <AlbumHero album={album} />
      <WhyThisAlbum album={album} />
      <AlbumActions opening={openAlbum.isPending} sharing={sharing} onOpen={open} onShare={share} />
      <RatingEditor album={album} />

      <View pointerEvents="none" collapsable={false} className="absolute -left-[2000px] top-0">
        <View ref={shareCardRef} collapsable={false}>
          <ShareCard album={album} />
        </View>
      </View>
    </View>
  );
}
