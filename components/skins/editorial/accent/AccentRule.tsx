import { LinearGradient } from 'expo-linear-gradient';
import { View, type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { accentFlow } from '@/components/skins/shared/skinStyles';
import { useAccentFlow } from '@/theme/skins/AccentFlowProvider';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

type Props = ViewProps & {
  thickness?: number;
  staticOnly?: boolean;
};

export function AccentRule({ thickness = 2, staticOnly = false, style, ...rest }: Props) {
  const palette = useEditorialPalette();
  const { progress, reduceMotion } = useAccentFlow();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${-66 * progress.value}%` }],
  }));
  const still = staticOnly || reduceMotion;

  return (
    <View
      {...rest}
      style={[
        {
          height: thickness,
          overflow: 'hidden',
          backgroundColor: palette.accentStatic,
        },
        style,
      ]}
    >
      {still ? null : (
        <Animated.View style={[{ width: '300%', height: '100%' }, animatedStyle]}>
          <LinearGradient
            colors={accentFlow}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}
