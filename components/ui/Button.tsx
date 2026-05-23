import { Pressable, type PressableProps } from 'react-native';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: Variant;
  className?: string;
};

const containerClasses: Record<Variant, string> = {
  primary: 'bg-accent active:opacity-80',
  secondary: 'bg-surface-2 active:opacity-80',
  ghost: 'bg-transparent active:opacity-60',
};

const textClasses: Record<Variant, string> = {
  primary: 'text-bg font-semibold',
  secondary: 'text-text font-semibold',
  ghost: 'text-accent font-semibold',
};

export function Button({ title, variant = 'primary', className, ...rest }: Props) {
  return (
    <Pressable
      className={`rounded-2xl px-5 py-3.5 items-center justify-center ${containerClasses[variant]} ${className ?? ''}`}
      {...rest}
    >
      <Text className={textClasses[variant]}>{title}</Text>
    </Pressable>
  );
}
