import { MotiView } from 'moti';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';

import { useReduceMotion } from '@/lib/hooks/useReduceMotion';

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
 */
export function Skeleton({ className }: Props) {
  const reduceMotion = useReduceMotion();
  const base = `bg-surface-2 ${className ?? ''}`;

  if (reduceMotion) {
    return <View className={base} style={{ opacity: 0.6 }} />;
  }

  return (
    <MotiView
      className={base}
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.8 }}
      transition={{ type: 'timing', duration: 900, loop: true, repeatReverse: true }}
    />
  );
}
