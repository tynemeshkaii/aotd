import { MotiView } from 'moti';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';

import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { useOptionalEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

// MotiView is third-party; wire `className` -> `style` so NativeWind classes work.
cssInterop(MotiView, { className: 'style' });

type Props = {
  /** Tailwind sizing/shape classes, e.g. "h-4 w-32 rounded-md". */
  className?: string;
};

/**
 * Pulsing placeholder block for first-load states. Uses a gentle opacity loop
 * (raw Reanimated via moti) so it stays cheap. Falls back to a static dim block
 * when Reduce Motion is on.
 *
 * When rendered inside the editorial skin, the base color follows the active
 * palette so night-mode skeletons do not stay light.
 */
export function Skeleton({ className }: Props) {
  const reduceMotion = useReduceMotion();
  const palette = useOptionalEditorialPalette();
  const backgroundColor = palette?.paperAlt;
  const base = `bg-surface-2 ${className ?? ''}`;

  if (reduceMotion) {
    return (
      <View
        className={base}
        style={[{ opacity: 0.6 }, backgroundColor ? { backgroundColor } : null]}
      />
    );
  }

  return (
    <MotiView
      className={base}
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.8 }}
      transition={{ type: 'timing', duration: 900, loop: true, repeatReverse: true }}
      style={backgroundColor ? { backgroundColor } : undefined}
    />
  );
}
