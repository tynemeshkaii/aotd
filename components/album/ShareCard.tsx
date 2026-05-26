import { Image, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { spotifyAlbumUrl } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
};

export function ShareCard({ album }: Props) {
  return (
    <View className="h-[1200px] w-[900px] justify-between bg-bg p-14">
      <View className="gap-9">
        <View className="h-[640px] w-[640px] overflow-hidden rounded-lg bg-surface-2">
          {album.album_cover_url ? (
            <Image
              source={{ uri: album.album_cover_url }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <View className="h-full w-full items-center justify-center px-16">
              <Text variant="h1" className="text-center text-muted">
                Album of the Day
              </Text>
            </View>
          )}
        </View>
        <View className="gap-3">
          <Text className="text-6xl font-bold text-text">{album.album_title}</Text>
          <Text className="text-4xl text-muted">{album.album_primary_artist_name}</Text>
          {album.album_release_year && (
            <Text className="text-3xl text-muted">{album.album_release_year}</Text>
          )}
        </View>
      </View>

      <View className="gap-3">
        <Text className="text-3xl font-semibold text-accent">via Album of the Day</Text>
        <Text className="text-2xl text-muted">{spotifyAlbumUrl(album.album_spotify_id)}</Text>
      </View>
    </View>
  );
}
