import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpotifyButton } from '@/components/auth/SpotifyButton';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import { editorialColors, ruleWeight, space, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import type { OnboardingViewProps } from '@/theme/skins/types';

const BEATS = [
  {
    label: 'Issue №0',
    title: 'A daily music periodical.',
    body: 'One album arrives each local day, printed from the edges of your Spotify library.',
  },
  {
    label: 'The ritual',
    title: 'Listen in your own time.',
    body: "Rate the issue when you are ready. Ratings are a private journal; they do not tune tomorrow's pick.",
  },
  {
    label: 'Subscribe',
    title: 'Connect Spotify to begin.',
    body: 'We use your saved music to avoid the obvious. Tokens stay server-side.',
  },
] as const;

export function EditorialOnboardingView({
  loading,
  onConnect,
  onExistingSignIn,
}: OnboardingViewProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const beat = BEATS[index] ?? BEATS[0];
  const isLast = index === BEATS.length - 1;

  const Content = reduceMotion ? View : Animated.View;
  const contentProps = reduceMotion ? {} : { entering: FadeInUp.duration(260) };

  return (
    <View
      className="flex-1 px-5"
      style={{
        backgroundColor: editorialColors.paper,
        paddingTop: insets.top + space.s6,
        paddingBottom: insets.bottom + space.s6,
      }}
    >
      <View className="flex-row items-center justify-between">
        <Text
          className="font-mono-bold text-[11px] uppercase"
          maxFontSizeMultiplier={1.3}
          style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
        >
          Album of the Day
        </Text>
        <Text
          className="font-mono text-[11px] uppercase"
          maxFontSizeMultiplier={1.3}
          style={{ color: editorialColors.accentStatic, letterSpacing: tracking.label }}
        >
          {beat.label}
        </Text>
      </View>
      <View
        className="mt-3"
        style={{ height: ruleWeight.rule, backgroundColor: editorialColors.ink }}
      />

      <View className="flex-1 justify-center">
        <Content key={beat.label} className="gap-5" {...contentProps}>
          <Text
            className="font-display text-[64px] uppercase leading-[60px]"
            maxFontSizeMultiplier={1.25}
            adjustsFontSizeToFit
            numberOfLines={3}
            style={{ color: editorialColors.ink, letterSpacing: 0 }}
          >
            {beat.title}
          </Text>
          <Text className="font-prose text-lg leading-7" style={{ color: editorialColors.ink }}>
            {beat.body}
          </Text>
        </Content>
      </View>

      <View className="gap-4">
        <View className="flex-row gap-2" accessible={false}>
          {BEATS.map((item, beatIndex) => (
            <View
              key={item.label}
              className="h-2 flex-1"
              style={{
                backgroundColor:
                  beatIndex <= index ? editorialColors.ink : editorialColors.paperAlt,
              }}
            />
          ))}
        </View>

        {isLast ? (
          <View className="gap-3 border-2 p-4" style={{ borderColor: editorialColors.ink }}>
            <SpotifyButton disabled={loading} loading={loading} onPress={onConnect} />
            <Pressable
              accessibilityRole="button"
              onPress={onExistingSignIn}
              className="min-h-11 items-center justify-center"
            >
              <Text
                className="font-mono-bold text-[11px] uppercase"
                style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
              >
                I have already connected before
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue onboarding"
            className="min-h-14 items-center justify-center border-2 px-5"
            style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.ink }}
            onPress={() => setIndex((current) => Math.min(current + 1, BEATS.length - 1))}
          >
            <Text
              className="font-mono-bold text-sm uppercase"
              style={{ color: editorialColors.paper, letterSpacing: tracking.label }}
            >
              Continue
            </Text>
          </Pressable>
        )}
      </View>
      {!reduceMotion ? <Animated.View entering={FadeIn.duration(180)} /> : null}
      <PaperGrain />
    </View>
  );
}
