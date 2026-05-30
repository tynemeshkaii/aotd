import { Text as RNText, type TextProps } from 'react-native';

type Variant = 'title' | 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label' | 'subtle';

type Props = TextProps & {
  variant?: Variant;
  className?: string;
};

const variantClasses: Record<Variant, string> = {
  title: 'text-text text-3xl font-bold tracking-tight', // hero album title
  h1: 'text-text text-2xl font-bold tracking-tight',
  h2: 'text-text text-xl font-semibold',
  h3: 'text-text text-lg font-semibold',
  body: 'text-text text-base',
  caption: 'text-muted text-sm',
  label: 'text-accent text-xs font-semibold uppercase tracking-widest', // eyebrow
  subtle: 'text-muted text-xs',
};

export function Text({ variant = 'body', className, ...rest }: Props) {
  return <RNText className={`${variantClasses[variant]} ${className ?? ''}`} {...rest} />;
}
