import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { EditorialActionButton } from '@/components/skins/editorial/EditorialActionButton';
import { editorialColors, space } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';

type Props = {
  opening: boolean;
  sharing: boolean;
  onOpen: () => void;
  onShare: () => void;
};

export function EditorialAlbumActions({ opening, sharing, onOpen, onShare }: Props) {
  const [pressed, setPressed] = React.useState(false);
  const inverted = pressed && !opening;
  const surface = inverted ? 'transparent' : editorialColors.ink;
  const onSurface = inverted ? editorialColors.ink : editorialColors.paper;

  return (
    <View style={{ gap: space.s3 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open in Spotify"
        accessibilityState={{ busy: opening }}
        disabled={opening}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          haptics.impactLight();
          onOpen();
        }}
        className="border-2 p-3"
        style={{ borderColor: editorialColors.ink, backgroundColor: surface }}
      >
        <View
          className="absolute left-0 right-0 top-0 h-[3px]"
          style={{ backgroundColor: editorialColors.accentStatic }}
        />
        <View className="flex-row items-stretch gap-3 pt-[3px]">
          <View
            className="min-h-[62px] w-[62px] items-center justify-center border-2"
            style={{
              borderColor: inverted ? editorialColors.ink : editorialColors.paper,
              backgroundColor: inverted ? editorialColors.ink : editorialColors.paper,
            }}
          >
            {opening ? (
              <ActivityIndicator color={inverted ? editorialColors.paper : editorialColors.ink} />
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
                  borderLeftColor: inverted ? editorialColors.paper : editorialColors.ink,
                }}
              />
            )}
          </View>
          <Text
            className="flex-1 self-center font-display text-[30px] uppercase leading-[29px]"
            style={{ color: onSurface, letterSpacing: 0 }}
          >
            Open in{'\n'}Spotify
          </Text>
        </View>
      </Pressable>

      <EditorialActionButton
        title={sharing ? 'Sharing...' : 'Share this issue'}
        tone="paper"
        loading={sharing}
        onPress={onShare}
      />
    </View>
  );
}
