import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { SkiaErrorBoundary } from './SkiaErrorBoundary';
import { Skia, skiaAvailable } from './skiaRuntime';

type Props = {
  width: number;
  height: number;
  /** Ink color (typically palette.ink, or palette.paper on already-inked surfaces). */
  color: string;
  /** Increment to trigger one ink-spread pulse. */
  trigger: number;
};

/**
 * Decorative letterpress ink-spread that pulses outward on each `trigger`
 * change. Strictly additive on top of a button's existing instant ink<->paper
 * inversion: it renders nothing when Skia is unavailable or Reduce Motion is on,
 * so the base interaction (the instant inversion) is always the fallback.
 */
export function InkPressOverlay({ width, height, color, trigger }: Props) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);
  const maxR = Math.hypot(width, height) / 2;

  useEffect(() => {
    if (reduceMotion || trigger === 0) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 420 });
  }, [trigger, reduceMotion, progress]);

  const radius = useDerivedValue(() => progress.value * maxR);
  // Ink lands fast, then lifts — a brief impression rather than a steady fill.
  const opacity = useDerivedValue(() => (1 - progress.value) * 0.22);

  if (reduceMotion || !skiaAvailable || !Skia || width === 0 || height === 0) {
    return null;
  }

  const { Canvas, Circle } = Skia;

  return (
    <SkiaErrorBoundary>
      <Canvas
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Circle cx={width / 2} cy={height / 2} r={radius} color={color} opacity={opacity} />
      </Canvas>
    </SkiaErrorBoundary>
  );
}
