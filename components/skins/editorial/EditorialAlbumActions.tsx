import { ActivityIndicator, Pressable, View } from 'react-native';

import { editorialColors } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';

type Props = {
  opening: boolean;
  sharing: boolean;
  onOpen: () => void;
  onShare: () => void;
};

export function EditorialAlbumActions({ opening, sharing, onOpen, onShare }: Props) {
  return (
    <View className="gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Listen on Spotify"
        accessibilityState={{ busy: opening }}
        disabled={opening}
        onPress={() => {
          haptics.impactLight();
          onOpen();
        }}
        className="border-2 p-[11px] active:opacity-70"
        style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.ink }}
      >
        <View
          className="absolute left-0 right-0 top-0 h-[3px]"
          style={{ backgroundColor: '#d9a441' }}
        />
        <View className="flex-row items-stretch gap-[13px] pt-[3px]">
          <View
            className="min-h-[62px] w-[62px] items-center justify-center border-2"
            style={{ borderColor: editorialColors.paper, backgroundColor: editorialColors.paper }}
          >
            {opening ? (
              <ActivityIndicator color={editorialColors.ink} />
            ) : (
              <View
                style={{
                  width: 0,
                  height: 0,
                  marginLeft: 5,
                  borderTopWidth: 14,
                  borderBottomWidth: 14,
                  borderLeftWidth: 22,
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                  borderLeftColor: editorialColors.ink,
                }}
              />
            )}
          </View>
          <Text
            className="flex-1 self-center font-display text-[30px] uppercase leading-[29px]"
            style={{ color: editorialColors.paper, letterSpacing: 0 }}
          >
            Listen{'\n'}on Spotify
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share album card"
        accessibilityState={{ busy: sharing }}
        disabled={sharing}
        onPress={() => {
          haptics.impactLight();
          onShare();
        }}
        className="min-h-11 self-start justify-center active:opacity-70"
      >
        <Text
          className="font-mono-bold text-[13px] uppercase leading-4"
          style={{ color: editorialColors.muted, letterSpacing: 1.3 }}
        >
          {sharing ? 'Sharing…' : 'Share ↗'}
        </Text>
      </Pressable>
    </View>
  );
}
