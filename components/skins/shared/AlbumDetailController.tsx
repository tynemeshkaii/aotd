import * as Sharing from 'expo-sharing';
import { type ReactNode, useRef, useState } from 'react';
import { Alert, Image, Platform, Share, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { useOpenAlbum } from '@/lib/hooks/useOpenAlbum';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { useSpotifyFreeExplainer } from '@/lib/hooks/useSpotifyFreeExplainer';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { spotifyAlbumUrl } from '@/lib/recommendation';
import { useAccentFlowFocus } from '@/theme/skins/AccentFlowProvider';
import { useSkinComponents } from '@/theme/skins/registry';
import type { ShareFormat } from '@/theme/skins/types';

type Props = {
  album: AlbumDiscovery;
  isToday?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function AlbumDetailController({
  album,
  isToday,
  header,
  footer,
  refreshing,
  onRefresh,
}: Props) {
  const components = useSkinComponents();
  useAccentFlowFocus();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const scrollY = useSharedValue(0);
  const squareShareCardRef = useRef<View>(null);
  const storyShareCardRef = useRef<View>(null);
  const minimalShareCardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [shareFormat, setShareFormat] = useState<ShareFormat>('square');
  const openAlbum = useOpenAlbum(album);
  const freeExplainer = useSpotifyFreeExplainer();
  const isFreeSpotify =
    freeExplainer.spotifyProduct === 'free' || freeExplainer.spotifyProduct === 'open';

  const shareRefFor = (format: ShareFormat) => {
    if (format === 'story') return storyShareCardRef;
    if (format === 'minimal') return minimalShareCardRef;
    return squareShareCardRef;
  };

  const open = async () => {
    await freeExplainer.maybeShow();
    openAlbum.mutate();
  };

  const share = async () => {
    if (Platform.OS !== 'ios') {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing is not available on this device.');
        return;
      }
    }

    try {
      setSharing(true);
      let captureFormat: ShareFormat = album.album_cover_url ? shareFormat : 'minimal';

      if (album.album_cover_url && captureFormat !== 'minimal') {
        try {
          await Image.prefetch(album.album_cover_url);
        } catch (error) {
          console.warn('Could not prefetch album cover before sharing', error);
          captureFormat = 'minimal';
        }
      }

      const targetRef = shareRefFor(captureFormat);
      if (!targetRef.current) {
        Alert.alert('Could not build the share card.');
        return;
      }

      const uri = await captureRef(targetRef, { format: 'png', quality: 1 });
      const message = `My album of the day: ${album.album_primary_artist_name} - ${album.album_title} ${spotifyAlbumUrl(album.album_spotify_id)}`;

      if (Platform.OS === 'ios') {
        await Share.share({ url: uri, message }, { subject: 'Album of the Day' });
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
    <View className="flex-1" style={{ backgroundColor: components.chrome.rootBackground }}>
      <components.AlbumDetailView
        album={album}
        isToday={isToday}
        header={header}
        footer={footer}
        scrollY={scrollY}
        reduceMotion={reduceMotion}
        topInset={insets.top}
        bottomInset={insets.bottom}
        opening={openAlbum.isPending}
        sharing={sharing}
        shareFormat={shareFormat}
        onOpen={open}
        onShare={share}
        onShareFormatChange={setShareFormat}
        isFreeSpotify={isFreeSpotify}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      <View pointerEvents="none" collapsable={false} className="absolute -left-[3000px] top-0">
        <View ref={squareShareCardRef} collapsable={false}>
          <components.ShareCard album={album} format="square" />
        </View>
        <View ref={storyShareCardRef} collapsable={false}>
          <components.ShareCard album={album} format="story" />
        </View>
        <View ref={minimalShareCardRef} collapsable={false}>
          <components.ShareCard album={album} format="minimal" />
        </View>
      </View>
    </View>
  );
}
