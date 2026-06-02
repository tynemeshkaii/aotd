import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { CoverImage } from '@/components/ui/CoverImage';
import colors from '@/theme/colors';

type Props = {
  uri?: string | null;
  scrollY: SharedValue<number>;
  reduceMotion: boolean;
  topInset: number;
};

/**
 * "Color from the cover" backdrop. An enlarged, blurred copy of the album art
 * bleeds from the top behind the content, with a gradient scrim fading to `bg`
 * so text stays legible. Parallaxes up on scroll and stretches on overscroll.
 * Expo-Go-safe: no pixel color extraction, just blur + gradient.
 */
export function CoverBackdrop({ uri, scrollY, reduceMotion, topInset }: Props) {
  const height = 460 + topInset;

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const y = scrollY.value;
    return {
      transform: [
        { translateY: y > 0 ? -y * 0.3 : 0 },
        { scale: y < 0 ? 1 + (-y / height) * 0.6 : 1 },
      ],
    };
  });

  if (!uri) {
    return (
      <View pointerEvents="none" className="absolute left-0 right-0 top-0" style={{ height }}>
        <LinearGradient
          colors={[colors.primary, colors.bg] as const}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 top-0 overflow-hidden"
      style={{ height }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <CoverImage
          uri={uri}
          blurRadius={60}
          style={{ width: '100%', height: '100%', opacity: 0.45 }}
        />
      </Animated.View>
      <LinearGradient
        colors={['rgba(18,10,12,0.16)', 'rgba(18,10,12,0.72)', colors.bg] as const}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
