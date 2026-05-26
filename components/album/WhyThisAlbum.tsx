import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { formatSelectionReason } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
};

export function WhyThisAlbum({ album }: Props) {
  return (
    <View className="rounded-lg border border-surface-2 bg-surface px-4 py-3">
      <Text variant="caption" className="mb-1 uppercase text-muted">
        Why this album
      </Text>
      <Text variant="body">{formatSelectionReason(album.selection_reason)}</Text>
    </View>
  );
}
