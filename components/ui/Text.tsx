import { Text as RNText, type TextProps } from 'react-native';

type Variant =
  | 'display'
  | 'screenTitle'
  | 'title'
  | 'sectionTitle'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'caption'
  | 'label'
  | 'subtle';

type Props = TextProps & {
  variant?: Variant;
  className?: string;
};

const variantClasses: Record<Variant, string> = {
  display: 'text-text text-5xl font-display leading-[54px]',
  screenTitle: 'text-text text-3xl font-display uppercase leading-[36px]',
  title: 'text-text text-3xl font-display leading-[36px]',
  sectionTitle: 'text-text text-lg font-prose-bold leading-6',
  h1: 'text-text text-2xl font-display uppercase leading-8',
  h2: 'text-text text-xl font-prose-bold leading-7',
  h3: 'text-text text-lg font-prose-bold leading-6',
  body: 'text-text text-base font-prose leading-6',
  caption: 'text-muted text-sm font-mono leading-5',
  label: 'text-accent text-xs font-mono-bold uppercase leading-4',
  subtle: 'text-muted text-xs font-mono leading-4',
};

export function Text({ variant, className, ...rest }: Props) {
  const resolvedClassName = variant
    ? `${variantClasses[variant]} ${className ?? ''}`
    : (className ?? variantClasses.body);

  return <RNText allowFontScaling={false} className={resolvedClassName} {...rest} />;
}
