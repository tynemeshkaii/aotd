import * as React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

type Tone = 'ink' | 'paper' | 'red';

// Pressed state inverts ink<->paper like a print impression instead of fading
// opacity. Disabled keeps the resting palette at reduced opacity.
function resolveTone(
  palette: ReturnType<typeof useEditorialPalette>,
  tone: Tone,
  pressed: boolean,
) {
  const borderColor = tone === 'red' ? palette.red : palette.ink;
  if (tone === 'ink') {
    return pressed
      ? { borderColor, backgroundColor: 'transparent', foreground: palette.ink }
      : { borderColor, backgroundColor: palette.ink, foreground: palette.paper };
  }
  if (tone === 'red') {
    return pressed
      ? { borderColor, backgroundColor: palette.red, foreground: palette.paper }
      : { borderColor, backgroundColor: 'transparent', foreground: palette.red };
  }
  return pressed
    ? { borderColor, backgroundColor: palette.ink, foreground: palette.paper }
    : { borderColor, backgroundColor: 'transparent', foreground: palette.ink };
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
  const palette = useEditorialPalette();
  const [pressed, setPressed] = React.useState(false);
  const reduceMotion = useReduceMotion();
  const isDisabled = disabled || loading;
  const p = resolveTone(palette, tone, pressed && !isDisabled);
  const shouldScale = pressed && !isDisabled && !reduceMotion;
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
      style={{
        borderColor: p.borderColor,
        backgroundColor: p.backgroundColor,
        transform: [{ scale: shouldScale ? 0.98 : 1 }],
      }}
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
