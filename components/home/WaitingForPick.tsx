import { View } from 'react-native';

import { Text } from '@/components/ui/Text';

export function WaitingForPick() {
  return (
    <View className="flex-1 items-center justify-center py-20">
      <Text variant="h2" className="text-center">
        Your pick is brewing...
      </Text>
      <Text variant="caption" className="text-center mt-2">
        Should be ready by your usual push time. Check back soon.
      </Text>
    </View>
  );
}
