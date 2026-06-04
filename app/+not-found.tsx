import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand/BrandMark';
import { Text } from '@/components/ui/Text';
import { usePageBottomPadding } from '@/lib/navigationChrome';
import { useSkinComponents } from '@/theme/skins/registry';

export default function NotFoundScreen() {
  const { chrome } = useSkinComponents();
  const insets = useSafeAreaInsets();
  const bottomPadding = usePageBottomPadding();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View
        className="flex-1"
        style={{ paddingTop: insets.top, backgroundColor: chrome.rootBackground }}
      >
        <View className="flex-1 justify-center px-5" style={{ paddingBottom: bottomPadding }}>
          <View className="mb-6 self-start border-2 p-4" style={{ borderColor: chrome.text }}>
            <BrandMark size={56} muted />
          </View>
          <Text
            className="font-display text-4xl uppercase leading-10"
            style={{ color: chrome.text, letterSpacing: 0 }}
          >
            This track is missing
          </Text>
          <Text className="mt-3 font-prose text-base leading-6" style={{ color: chrome.muted }}>
            The screen you opened does not exist.
          </Text>
          <Link href="/" className="mt-6">
            <Text
              className="font-mono-bold text-sm uppercase leading-5"
              style={{ color: chrome.accent, letterSpacing: 0.8 }}
            >
              Back to Home ↗
            </Text>
          </Link>
        </View>
      </View>
    </>
  );
}
