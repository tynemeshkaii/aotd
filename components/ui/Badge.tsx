import { View, type ViewProps } from 'react-native';

import { Text } from './Text';

type Variant = 'accent' | 'muted' | 'success' | 'warning' | 'rating' | 'spotify';

type Props = ViewProps & {
  label: string;
  variant?: Variant;
  className?: string;
  textClassName?: string;
};

const containerClasses: Record<Variant, string> = {
  accent: 'border-accent/30 bg-accent/15',
  muted: 'border-text/10 bg-surface-2',
  success: 'border-spotify/25 bg-spotify/15',
  warning: 'border-rate-liked/30 bg-rate-liked/15',
  rating: 'border-rate-loved/30 bg-rate-loved/15',
  spotify: 'border-spotify/30 bg-spotify/15',
};

const textClasses: Record<Variant, string> = {
  accent: 'text-accent',
  muted: 'text-text',
  success: 'text-spotify',
  warning: 'text-rate-liked',
  rating: 'text-rate-loved',
  spotify: 'text-spotify',
};

export function Badge({ label, variant = 'muted', className, textClassName, ...rest }: Props) {
  return (
    <View
      className={`min-h-7 justify-center rounded-full border px-3 py-1 ${containerClasses[variant]} ${className ?? ''}`}
      {...rest}
    >
      <Text
        variant="subtle"
        className={`flex-shrink font-semibold ${textClasses[variant]} ${textClassName ?? ''}`}
      >
        {label}
      </Text>
    </View>
  );
}
