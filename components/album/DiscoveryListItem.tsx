import { Image, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { getDiscoveryStatusLabel } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
  onPress: () => void;
};

export function DiscoveryListItem({ album, onPress }: Props) {
  const date = new Date(`${album.pick_date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row gap-3 rounded-lg bg-surface p-3 active:opacity-80"
    >
      <View className="h-16 w-16 overflow-hidden rounded-md bg-surface-2">
        {album.album_cover_url && (
          <Image
            source={{ uri: album.album_cover_url }}
            className="h-full w-full"
            resizeMode="cover"
          />
        )}
      </View>
      <View className="min-w-0 flex-1 justify-center">
        <Text numberOfLines={1} className="font-semibold">
          {album.album_title}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {album.album_primary_artist_name}
        </Text>
        <Text variant="caption" className="mt-1">
          {date} · {getDiscoveryStatusLabel(album)}
        </Text>
      </View>
    </Pressable>
  );
}
