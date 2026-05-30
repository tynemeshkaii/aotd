import { MotiView } from 'moti';
import { Pressable, View } from 'react-native';

import { CoverImage } from '@/components/ui/CoverImage';
import { Text } from '@/components/ui/Text';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { getDiscoveryStatusLabel } from '@/lib/recommendation';
import colors from '@/theme/colors';

// FlatList recycles rows, so a per-item `from` animation would replay the
// fade-in on every scroll and every realtime refetch. Track which picks have
// already animated (per app session) so each entrance plays exactly once.
const animatedOnce = new Set<string>();

type Props = {
  album: AlbumDiscovery;
  index?: number;
  onPress: () => void;
};

function statusTint(album: AlbumDiscovery): string {
  if (album.rating_score) {
    return (
      {
        5: colors['rate-loved'],
        4: colors['rate-liked'],
        3: colors['rate-alright'],
        2: colors['rate-notforme'],
        1: colors['rate-bad'],
      }[album.rating_score] ?? colors.muted
    );
  }
  if (album.status === 'opened') return colors.accent;
  return colors.muted;
}

export function DiscoveryListItem({ album, index = 0, onPress }: Props) {
  const reduceMotion = useReduceMotion();
  const date = new Date(`${album.pick_date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const tint = statusTint(album);
  const label = getDiscoveryStatusLabel(album);

  // Only animate the very first time this pick appears this session.
  const shouldAnimate = !reduceMotion && !animatedOnce.has(album.aotd_id);
  if (shouldAnimate) {
    animatedOnce.add(album.aotd_id);
  }

  return (
    <MotiView
      from={shouldAnimate ? { opacity: 0, translateY: 10 } : undefined}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 240, delay: Math.min(index, 8) * 40 }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="flex-row gap-3 rounded-2xl bg-surface p-3 active:opacity-80"
      >
        <View className="h-16 w-16 overflow-hidden rounded-xl bg-surface-2">
          {album.album_cover_url ? (
            <CoverImage uri={album.album_cover_url} className="h-full w-full" />
          ) : null}
        </View>
        <View className="min-w-0 flex-1 justify-center">
          <Text numberOfLines={1} className="font-semibold">
            {album.album_title}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {album.album_primary_artist_name}
          </Text>
          <View className="mt-1.5 flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: tint }} />
            <Text variant="subtle">
              {date} · {label}
            </Text>
          </View>
        </View>
      </Pressable>
    </MotiView>
  );
}
