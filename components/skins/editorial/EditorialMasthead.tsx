import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ruleWeight, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { useAccentFlow } from '@/theme/skins/AccentFlowProvider';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

type EditorialMastheadProps = {
  issueLabel?: string;
  dateLabel?: string;
  rule?: keyof typeof ruleWeight;
  /**
   * When true, the rule "ink-bleeds" in from the left each time the screen
   * gains focus. Gated through AccentFlow's Reduce-Motion logic (instant rule
   * when Reduce Motion is on). Reserved for the Home hero masthead — keep
   * flowing-accent scarcity; do not enable on every surface.
   */
  reveal?: boolean;
};

export function EditorialMasthead({
  issueLabel,
  dateLabel,
  rule = 'rule',
  reveal = false,
}: EditorialMastheadProps) {
  const palette = useEditorialPalette();
  const { reduceMotion } = useAccentFlow();
  const aside = [issueLabel, dateLabel].filter(Boolean).join(' / ');
  const [ruleWidth, setRuleWidth] = useState(0);
  // 1 = fully inked. Static (1) unless a reveal is requested and motion is allowed.
  const bleed = useSharedValue(reveal && !reduceMotion ? 0 : 1);

  useFocusEffect(
    useCallback(() => {
      if (!reveal || reduceMotion) {
        bleed.value = 1;
        return undefined;
      }
      bleed.value = 0;
      bleed.value = withTiming(1, { duration: 520 });
      return undefined;
    }, [reveal, reduceMotion, bleed]),
  );

  const ruleStyle = useAnimatedStyle(() => ({
    width: ruleWidth > 0 ? ruleWidth * bleed.value : undefined,
  }));

  return (
    <View accessibilityRole="header">
      <View className="flex-row items-center justify-between gap-4">
        <Text
          className="shrink font-mono-bold text-[11px] uppercase leading-4"
          style={{ color: palette.ink, letterSpacing: tracking.label }}
          maxFontSizeMultiplier={1.3}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          Album of the Day
        </Text>
        {aside ? (
          <Text
            className="shrink-0 text-right font-mono text-[11px] uppercase leading-4"
            style={{ color: palette.muted, letterSpacing: tracking.label }}
            maxFontSizeMultiplier={1.3}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {aside}
          </Text>
        ) : null}
      </View>
      <View
        className="mt-2"
        onLayout={(e: LayoutChangeEvent) => setRuleWidth(Math.round(e.nativeEvent.layout.width))}
      >
        <Animated.View
          style={[
            { height: ruleWeight[rule], backgroundColor: palette.ink },
            reveal ? ruleStyle : null,
          ]}
        />
      </View>
    </View>
  );
}
