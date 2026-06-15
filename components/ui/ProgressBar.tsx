import { View } from 'react-native';

import colors from '@/theme/colors';

type Props = {
  ratio: number;
  className?: string;
  trackColor?: string;
  fillColor?: string;
  borderColor?: string;
  height?: number;
  bordered?: boolean;
};

export function ProgressBar({
  ratio,
  className,
  trackColor = colors['surface-2'],
  fillColor = colors.accent,
  borderColor,
  height = 6,
  bordered = false,
}: Props) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const pct = Math.round(clamped * 100);
  const width: `${number}%` = `${pct}%`;

  return (
    <View
      className={`overflow-hidden ${bordered ? 'border-2' : 'rounded-full'} ${className ?? ''}`}
      style={{
        height,
        backgroundColor: trackColor,
        borderColor: bordered ? (borderColor ?? fillColor) : undefined,
      }}
    >
      <View
        className={bordered ? 'h-full' : 'h-full rounded-full'}
        style={{ width, backgroundColor: fillColor }}
      />
    </View>
  );
}
