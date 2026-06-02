import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

type Props = ViewProps & {
  children: ReactNode;
  /** Frosted-glass surface (lets a cover backdrop show through). */
  glass?: boolean;
  variant?: 'default' | 'elevated' | 'glass' | 'subtle' | 'outline';
  className?: string;
};

/**
 * Standard content surface. `surface` background + rounded-2xl by default, or a
 * frosted-glass blur surface when `glass` is set (used over the cover backdrop).
 */
const variantClasses = {
  default: 'rounded-xl bg-surface p-5',
  elevated: 'rounded-2xl bg-surface p-5 shadow-lg shadow-primary/30',
  subtle: 'rounded-xl bg-surface/55 p-5',
  outline: 'rounded-xl border border-text/10 bg-transparent p-5',
};

export function Card({ children, glass = false, variant = 'default', className, ...rest }: Props) {
  if (glass || variant === 'glass') {
    return (
      <View
        className={`overflow-hidden rounded-xl border border-text/10 ${className ?? ''}`}
        {...rest}
      >
        <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
        <View className="p-5">{children}</View>
      </View>
    );
  }

  return (
    <View className={`${variantClasses[variant]} ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
}
