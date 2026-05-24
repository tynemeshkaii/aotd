import { Image, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { LibraryItem } from '@/lib/hooks/useLibrary';

export function LibraryListItem({ item }: { item: LibraryItem }) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-surface px-3 py-2">
      {item.cover_url ? (
        <Image
          accessibilityLabel={`${item.album_name} cover`}
          source={{ uri: item.cover_url }}
          style={{ width: 56, height: 56, borderRadius: 6 }}
        />
      ) : (
        <View
          className="items-center justify-center rounded-md bg-surface-2"
          style={{ width: 56, height: 56 }}
        >
          <Text className="text-2xl text-muted">♪</Text>
        </View>
      )}
      <View className="flex-1">
        <Text className="font-semibold" numberOfLines={1}>
          {item.album_name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {item.artist_name}
        </Text>
      </View>
    </View>
  );
}
