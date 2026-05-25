import { Image, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { formatSelectionReason, type TodayPick } from '@/lib/recommendation';

type Props = { pick: TodayPick };

export function TodayCard({ pick }: Props) {
  const reason = formatSelectionReason(pick.selection_reason);

  return (
    <View className="rounded-2xl bg-surface overflow-hidden">
      {pick.album_cover_url && (
        <Image
          source={{ uri: pick.album_cover_url }}
          className="w-full aspect-square"
          resizeMode="cover"
        />
      )}
      <View className="p-4 gap-1">
        <Text variant="h2">{pick.album_title}</Text>
        <Text variant="body" className="text-muted">
          {pick.album_primary_artist_name}
          {pick.album_release_year ? ` · ${pick.album_release_year}` : ''}
        </Text>
        <Text variant="caption" className="mt-2">
          {reason}
        </Text>
      </View>
    </View>
  );
}
