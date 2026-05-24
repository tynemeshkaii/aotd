import { View } from 'react-native';

type Props = {
  ratio: number;
  className?: string;
};

export function ProgressBar({ ratio, className }: Props) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const pct = Math.round(clamped * 100);
  const width: `${number}%` = `${pct}%`;
  return (
    <View className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className ?? ''}`}>
      <View className="h-full rounded-full bg-accent" style={{ width }} />
    </View>
  );
}
