import { View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Badge } from '@/components/ui/Badge';
import { CoverImage } from '@/components/ui/CoverImage';
import { Text } from '@/components/ui/Text';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { formatAlbumDuration, formatArtistCountry } from '@/lib/recommendation';
import colors from '@/theme/colors';

type Props = {
  album: AlbumDiscovery;
  scrollY: SharedValue<number>;
  reduceMotion: boolean;
};

export function AlbumHero({ album, scrollY, reduceMotion }: Props) {
  const duration = formatAlbumDuration(album.album_duration_ms);
  const country = formatArtistCountry(album.album_artist_country);
  const meta = [
    album.album_release_year?.toString(),
    country,
    album.album_total_tracks ? `${album.album_total_tracks} tracks` : null,
    duration,
  ].filter((item): item is string => Boolean(item));

  // Gentle zoom on overscroll for a tactile "stretchy" hero.
  const coverStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const y = scrollY.value;
    const scale = y < 0 ? 1 + -y / 700 : 1;
    return { transform: [{ scale }] };
  });

  return (
    <View className="gap-4">
      {/* Shadow layer (no overflow:hidden — iOS clips a view's own shadow). */}
      <View
        className="rounded-2xl bg-surface-2"
        style={{
          shadowColor: colors.primary,
          shadowOpacity: 0.5,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 18 },
          elevation: 12,
        }}
      >
        {/* Clip layer for the rounded image. */}
        <View className="aspect-square overflow-hidden rounded-2xl bg-surface-2">
          <Animated.View style={[{ flex: 1 }, coverStyle]}>
            {album.album_cover_url ? (
              <CoverImage uri={album.album_cover_url} className="h-full w-full" />
            ) : (
              <View className="h-full w-full items-center justify-center px-8">
                <Text variant="h2" className="text-center text-muted">
                  Album cover
                </Text>
              </View>
            )}
          </Animated.View>
        </View>
      </View>

      <View className="gap-1">
        <Text variant="title" numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.84}>
          {album.album_title}
        </Text>
        <Text variant="body" numberOfLines={2} className="text-muted">
          {album.album_primary_artist_name}
        </Text>
        {meta.length > 0 && (
          <View className="mt-2 flex-row flex-wrap gap-2">
            {meta.map((item) => (
              <Badge key={item} label={item} variant="muted" />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
