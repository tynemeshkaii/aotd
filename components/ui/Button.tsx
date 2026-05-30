import {
  ActivityIndicator,
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  View,
} from 'react-native';

import { haptics } from '@/lib/haptics';
import colors from '@/theme/colors';

import { Text } from './Text';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'glass';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: Variant;
  className?: string;
  /** Show an inline spinner and disable the press. */
  loading?: boolean;
  /** Set false to suppress the press haptic. */
  haptic?: boolean;
};

const containerClasses: Record<Variant, string> = {
  primary: 'bg-primary active:opacity-80',
  accent: 'bg-accent active:opacity-80',
  secondary: 'bg-surface-2 active:opacity-80',
  ghost: 'bg-transparent active:opacity-60',
  glass: 'bg-surface-2/70 border border-text/10 active:opacity-70',
};

const textClasses: Record<Variant, string> = {
  primary: 'text-on-primary font-semibold',
  accent: 'text-bg font-semibold',
  secondary: 'text-text font-semibold',
  ghost: 'text-accent font-semibold',
  glass: 'text-text font-semibold',
};

const spinnerColor: Record<Variant, string> = {
  primary: colors['on-primary'],
  accent: colors.bg,
  secondary: colors.text,
  ghost: colors.accent,
  glass: colors.text,
};

export function Button({
  title,
  variant = 'primary',
  className,
  loading = false,
  haptic = true,
  disabled,
  onPress,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  const handlePress = (event: GestureResponderEvent) => {
    if (isDisabled) return;
    if (haptic) haptics.impactLight();
    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      className={`min-h-12 flex-row items-center justify-center rounded-2xl px-5 py-3.5 ${containerClasses[variant]} ${isDisabled ? 'opacity-60' : ''} ${className ?? ''}`}
      {...rest}
    >
      {loading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator color={spinnerColor[variant]} size="small" />
          <Text className={textClasses[variant]}>{title}</Text>
        </View>
      ) : (
        <Text className={textClasses[variant]}>{title}</Text>
      )}
    </Pressable>
  );
}
