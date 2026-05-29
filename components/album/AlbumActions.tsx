import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import colors from '@/theme/colors';

type Props = {
  opening?: boolean;
  sharing?: boolean;
  onOpen: () => void;
  onShare: () => void;
};

export function AlbumActions({ opening, sharing, onOpen, onShare }: Props) {
  return (
    <View className="flex-row gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open in Spotify"
        disabled={opening}
        onPress={onOpen}
        className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-accent px-4 active:opacity-80 disabled:opacity-60"
      >
        <Ionicons name="play" size={18} color={colors.bg} />
        <Text className="font-semibold text-bg">{opening ? 'Opening...' : 'Open in Spotify'}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share album card"
        disabled={sharing}
        onPress={onShare}
        className="h-12 w-12 items-center justify-center rounded-lg bg-surface-2 active:opacity-80 disabled:opacity-60"
      >
        <Ionicons name="share-outline" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}
