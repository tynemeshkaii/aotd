import { Text as RNText, type TextProps } from 'react-native';

type Variant = 'h1' | 'h2' | 'body' | 'caption';

type Props = TextProps & {
  variant?: Variant;
  className?: string;
};

const variantClasses: Record<Variant, string> = {
  h1: 'text-text text-3xl font-bold',
  h2: 'text-text text-xl font-semibold',
  body: 'text-text text-base',
  caption: 'text-muted text-sm',
};

export function Text({ variant = 'body', className, ...rest }: Props) {
  return <RNText className={`${variantClasses[variant]} ${className ?? ''}`} {...rest} />;
}
