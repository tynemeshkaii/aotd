import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';
import colors from '@/theme/colors';

type Props = {
  opening?: boolean;
  sharing?: boolean;
  onOpen: () => void;
  onShare: () => void;
};

export function AlbumActions({ opening, sharing, onOpen, onShare }: Props) {
  const handleOpen = () => {
    haptics.impactLight();
    onOpen();
  };

  const handleShare = () => {
    haptics.impactLight();
    onShare();
  };

  return (
    <View className="flex-row gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open in Spotify"
        disabled={opening}
        onPress={handleOpen}
        className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary px-4 active:opacity-80 disabled:opacity-60"
      >
        {opening ? (
          <ActivityIndicator size="small" color={colors['on-primary']} />
        ) : (
          <Ionicons name="play" size={18} color={colors['on-primary']} />
        )}
        <Text className="font-semibold text-on-primary">
          {opening ? 'Opening...' : 'Open in Spotify'}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share album card"
        disabled={sharing}
        onPress={handleShare}
        className="h-12 w-12 items-center justify-center rounded-2xl border border-text/10 bg-surface-2/70 active:opacity-70 disabled:opacity-60"
      >
        {sharing ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Ionicons name="share-outline" size={20} color={colors.text} />
        )}
      </Pressable>
    </View>
  );
}
