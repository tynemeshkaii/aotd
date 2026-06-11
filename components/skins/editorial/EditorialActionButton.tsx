import * as React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { editorialColors, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';

type Tone = 'ink' | 'paper' | 'red';

// Pressed state inverts ink<->paper like a print impression instead of fading
// opacity. Disabled keeps the resting palette at reduced opacity.
function palette(tone: Tone, pressed: boolean) {
  const borderColor = tone === 'red' ? editorialColors.red : editorialColors.ink;
  if (tone === 'ink') {
    return pressed
      ? { borderColor, backgroundColor: 'transparent', foreground: editorialColors.ink }
      : { borderColor, backgroundColor: editorialColors.ink, foreground: editorialColors.paper };
  }
  if (tone === 'red') {
    return pressed
      ? { borderColor, backgroundColor: editorialColors.red, foreground: editorialColors.paper }
      : { borderColor, backgroundColor: 'transparent', foreground: editorialColors.red };
  }
  return pressed
    ? { borderColor, backgroundColor: editorialColors.ink, foreground: editorialColors.paper }
    : { borderColor, backgroundColor: 'transparent', foreground: editorialColors.ink };
}

export function EditorialActionButton({
  title,
  onPress,
  loading,
  disabled,
  tone = 'ink',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: Tone;
}) {
  const [pressed, setPressed] = React.useState(false);
  const isDisabled = disabled || loading;
  const p = palette(tone, pressed && !isDisabled);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        setPressed(false);
        haptics.impactLight();
        onPress();
      }}
      className={`min-h-12 flex-row items-center justify-center gap-2 border-2 px-4 py-3 ${
        isDisabled ? 'opacity-60' : ''
      }`}
      style={{ borderColor: p.borderColor, backgroundColor: p.backgroundColor }}
    >
      {loading ? <ActivityIndicator color={p.foreground} size="small" /> : null}
      <Text
        className="font-mono-bold text-xs uppercase leading-4"
        style={{ color: p.foreground, letterSpacing: tracking.label }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
