import * as Sharing from 'expo-sharing';
import { type ReactNode, useRef, useState } from 'react';
import { Alert, Image, Platform, Share, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { AlbumActions } from '@/components/album/AlbumActions';
import { AlbumHero } from '@/components/album/AlbumHero';
import { CoverBackdrop } from '@/components/album/CoverBackdrop';
import { RatingEditor } from '@/components/album/RatingEditor';
import { ShareCard } from '@/components/album/ShareCard';
import { WhyThisAlbum } from '@/components/album/WhyThisAlbum';
import { Text } from '@/components/ui/Text';
import { useOpenAlbum } from '@/lib/hooks/useOpenAlbum';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { useSpotifyFreeExplainer } from '@/lib/hooks/useSpotifyFreeExplainer';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { spotifyAlbumUrl } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
  isToday?: boolean;
  /** Rendered above the hero (e.g. a back button on the detail screen). */
  header?: ReactNode;
  /** Rendered after the rating editor (e.g. the "past picks waiting" nudge). */
  footer?: ReactNode;
};

export function AlbumDetail({ album, isToday, header, footer }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const shareCardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const openAlbum = useOpenAlbum(album);
  const freeExplainer = useSpotifyFreeExplainer();
  const isFreeSpotify =
    freeExplainer.spotifyProduct === 'free' || freeExplainer.spotifyProduct === 'open';

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

      const message = `My album of the day: ${album.album_primary_artist_name} — ${album.album_title} 🎧 ${spotifyAlbumUrl(album.album_spotify_id)}`;

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
    <View className="flex-1 bg-bg">
      <CoverBackdrop
        uri={album.album_cover_url}
        scrollY={scrollY}
        reduceMotion={reduceMotion}
        topInset={insets.top}
      />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <View className="gap-5">
          {header}
          {isToday && <Text variant="label">Today's album</Text>}

          <AlbumHero album={album} scrollY={scrollY} reduceMotion={reduceMotion} />
          <WhyThisAlbum album={album} />
          <AlbumActions
            opening={openAlbum.isPending}
            sharing={sharing}
            onOpen={open}
            onShare={share}
          />
          {isFreeSpotify && (
            <Text variant="caption" className="text-muted">
              Heads up: Free Spotify may shuffle this album. Premium plays it in order.
            </Text>
          )}
          <RatingEditor album={album} />
          {footer}
        </View>
      </Animated.ScrollView>

      {/* Off-screen capture target for the share card. Stays on RN Image for
          reliable view-shot capture (do not route through expo-image). */}
      <View pointerEvents="none" collapsable={false} className="absolute -left-[2000px] top-0">
        <View ref={shareCardRef} collapsable={false}>
          <ShareCard album={album} />
        </View>
      </View>
    </View>
  );
}
