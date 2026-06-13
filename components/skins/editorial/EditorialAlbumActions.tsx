import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { EditorialActionButton } from '@/components/skins/editorial/EditorialActionButton';
import { editorialColors, space, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import type { ShareFormat } from '@/theme/skins/types';

type Props = {
  opening: boolean;
  sharing: boolean;
  shareFormat: ShareFormat;
  onOpen: () => void;
  onShare: () => void;
  onShareFormatChange: (format: ShareFormat) => void;
};

const shareFormats: { value: ShareFormat; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'story', label: 'Story' },
  { value: 'minimal', label: 'Minimal' },
];

export function EditorialAlbumActions({
  opening,
  sharing,
  shareFormat,
  onOpen,
  onShare,
  onShareFormatChange,
}: Props) {
  const [pressed, setPressed] = React.useState(false);
  const reduceMotion = useReduceMotion();
  const inverted = pressed && !opening;
  const surface = inverted ? 'transparent' : editorialColors.ink;
  const onSurface = inverted ? editorialColors.ink : editorialColors.paper;
  const shouldScale = pressed && !opening && !reduceMotion;

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
          setPressed(false);
          haptics.impactLight();
          onOpen();
        }}
        className="border-2 p-3"
        style={{
          borderColor: editorialColors.ink,
          backgroundColor: surface,
          transform: [{ scale: shouldScale ? 0.98 : 1 }],
        }}
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
      <View className="flex-row border-2" style={{ borderColor: editorialColors.ink }}>
        {shareFormats.map((format, index) => {
          const selected = shareFormat === format.value;
          return (
            <Pressable
              key={format.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={sharing}
              className="min-h-11 flex-1 items-center justify-center px-2"
              style={{
                borderLeftWidth: index === 0 ? 0 : 1,
                borderLeftColor: editorialColors.ink,
                backgroundColor: selected ? editorialColors.ink : editorialColors.paper,
                opacity: sharing ? 0.6 : 1,
              }}
              onPress={() => {
                haptics.selection();
                onShareFormatChange(format.value);
              }}
            >
              <Text
                className="font-mono-bold text-[10px] uppercase leading-4"
                style={{
                  color: selected ? editorialColors.paper : editorialColors.ink,
                  letterSpacing: tracking.label,
                }}
              >
                {format.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
