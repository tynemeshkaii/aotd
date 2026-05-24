import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function DiscoveriesScreen() {
  return (
    <Screen scroll={false}>
      <Text variant="h1">Discoveries</Text>
      <Text variant="caption" className="mt-1 mb-8">
        Albums we recommended to you
      </Text>

      <View className="flex-1 items-center justify-center px-8">
        <View className="mb-6 items-center justify-center rounded-full bg-surface p-6">
          <Ionicons name="sparkles" size={48} color="#1db954" />
        </View>
        <Text variant="h2" className="text-center">
          Your first discovery is coming
        </Text>
        <Text variant="caption" className="mt-3 text-center leading-5">
          Each morning we'll pick one album you don't have yet, based on your taste. Check back
          tomorrow.
        </Text>
      </View>
    </Screen>
  );
}
