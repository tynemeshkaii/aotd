import { Image, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { formatAlbumDuration } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
};

export function AlbumHero({ album }: Props) {
  const duration = formatAlbumDuration(album.album_duration_ms);
  const meta = [
    album.album_release_year?.toString(),
    album.album_total_tracks ? `${album.album_total_tracks} tracks` : null,
    duration,
  ].filter(Boolean);

  return (
    <View className="gap-4">
      <View className="aspect-square overflow-hidden rounded-lg bg-surface-2">
        {album.album_cover_url ? (
          <Image
            source={{ uri: album.album_cover_url }}
            className="h-full w-full"
            resizeMode="cover"
          />
        ) : (
          <View className="h-full w-full items-center justify-center px-8">
            <Text variant="h2" className="text-center text-muted">
              Album cover
            </Text>
          </View>
        )}
      </View>

      <View className="gap-1">
        <Text variant="h1">{album.album_title}</Text>
        <Text variant="body" className="text-muted">
          {album.album_primary_artist_name}
        </Text>
        {meta.length > 0 && (
          <Text variant="caption" className="mt-1">
            {meta.join(' · ')}
          </Text>
        )}
      </View>
    </View>
  );
}
