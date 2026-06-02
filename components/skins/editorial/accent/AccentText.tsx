import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Text as RNText, type TextProps, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';

import { accentFlow, editorialColors } from '@/components/skins/shared/skinStyles';
import { useAccentFlow } from '@/theme/skins/AccentFlowProvider';

type Props = TextProps & {
  children: string;
  className?: string;
  fallback?: boolean;
  staticOnly?: boolean;
};

export function AccentText({
  children,
  className,
  style,
  fallback = false,
  staticOnly = false,
  ...rest
}: Props) {
  const { progress, reduceMotion } = useAccentFlow();
  const still = staticOnly || reduceMotion;
  const flowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${-66 * progress.value}%` }],
  }));
  const fallbackStyle = useAnimatedStyle(() => ({
    color: still
      ? editorialColors.accentStatic
      : interpolateColor(progress.value, [0, 0.25, 0.5, 0.75, 1], [...accentFlow]),
  }));

  if (fallback || still) {
    return (
      <Animated.Text
        className={className}
        style={[fallbackStyle, style]}
        allowFontScaling={false}
        {...rest}
      >
        {children}
      </Animated.Text>
    );
  }

  return (
    <MaskedView
      maskElement={
        <RNText className={className} style={style} allowFontScaling={false} {...rest}>
          {children}
        </RNText>
      }
    >
      <View>
        <Animated.View style={[{ width: '300%' }, flowStyle]}>
          <LinearGradient colors={accentFlow} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}>
            <RNText className={className} style={[style, { opacity: 0 }]} allowFontScaling={false}>
              {children}
            </RNText>
          </LinearGradient>
        </Animated.View>
      </View>
    </MaskedView>
  );
}
