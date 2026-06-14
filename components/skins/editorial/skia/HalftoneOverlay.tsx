import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { SkiaErrorBoundary } from './SkiaErrorBoundary';
import { Skia, skiaAvailable } from './skiaRuntime';

// Riso/halftone dot texture. Not image-driven — a deterministic printed-dot
// overlay that gives the cover a screen-printed feel. Decorative only; the cover
// (CoverImage) renders underneath regardless, so Skia failing only drops the dots.
const HALFTONE_SOURCE = `
uniform float2 u_resolution;
uniform float u_cell;
uniform float u_radius;
uniform float4 u_color;

half4 main(float2 xy) {
  float2 cell = mod(xy, u_cell) - u_cell * 0.5;
  float d = length(cell);
  float r = u_cell * u_radius;
  float inside = 1.0 - smoothstep(r - 1.0, r + 1.0, d);
  return half4(half3(u_color.rgb), half(u_color.a * inside));
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const value =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

type Props = {
  /** Square side length in px. */
  size: number;
  /** Dot tint (typically palette.ink). */
  tint: string;
  /** Peak dot alpha. */
  opacity?: number;
};

/**
 * Static Skia halftone overlay for the album cover plate. Renders nothing when
 * Skia is unavailable or the effect fails to compile. A one-time fade-in settle
 * runs on first mount unless Reduce Motion is on (then it appears instantly).
 */
export function HalftoneOverlay({ size, tint, opacity = 0.08 }: Props) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: 600 });
  }, [progress, reduceMotion]);

  const effect = useMemo(() => {
    // RuntimeEffect.Make is a native call. In a runtime where the Skia JS package
    // resolves but the native module is absent (e.g. Expo Go), it can throw — and
    // this runs in the render body, ahead of the SkiaErrorBoundary below. Guard it
    // so the overlay degrades to nothing instead of taking down the cover subtree.
    if (!skiaAvailable || !Skia) return null;
    try {
      return Skia.Skia.RuntimeEffect.Make(HALFTONE_SOURCE);
    } catch {
      return null;
    }
  }, []);

  const uniforms = useMemo(() => {
    const [r, g, b] = hexToRgb(tint);
    return {
      u_resolution: [size, size],
      u_cell: 6,
      u_radius: 0.34,
      u_color: [r, g, b, opacity],
    };
  }, [size, tint, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!skiaAvailable || !Skia || !effect) return null;

  const { Canvas, Fill, Shader } = Skia;

  return (
    <SkiaErrorBoundary>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, animatedStyle]}
      >
        <Canvas style={{ width: size, height: size }}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </Animated.View>
    </SkiaErrorBoundary>
  );
}
