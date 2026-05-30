import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

type Props = ViewProps & {
  children: ReactNode;
  /** Frosted-glass surface (lets a cover backdrop show through). */
  glass?: boolean;
  className?: string;
};

/**
 * Standard content surface. `surface` background + rounded-2xl by default, or a
 * frosted-glass blur surface when `glass` is set (used over the cover backdrop).
 */
export function Card({ children, glass = false, className, ...rest }: Props) {
  if (glass) {
    return (
      <View
        className={`overflow-hidden rounded-2xl border border-text/10 ${className ?? ''}`}
        {...rest}
      >
        <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
        <View className="p-5">{children}</View>
      </View>
    );
  }

  return (
    <View className={`rounded-2xl bg-surface p-5 ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
}
