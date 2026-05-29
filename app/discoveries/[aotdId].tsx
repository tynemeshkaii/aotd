import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AlbumDetail } from '@/components/album/AlbumDetail';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useDiscoveryDetail } from '@/lib/hooks/useDiscoveryDetail';
import colors from '@/theme/colors';

export default function DiscoveryDetailScreen() {
  const { aotdId } = useLocalSearchParams<{ aotdId?: string }>();
  const { data: album, isError, isLoading, refetch } = useDiscoveryDetail(aotdId);

  const goBack = () => {
    router.replace('/(tabs)/discoveries');
  };

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Discoveries"
        onPress={goBack}
        className="mb-5 h-10 w-10 items-center justify-center rounded-lg bg-surface active:opacity-80"
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>

      {isLoading ? (
        <View className="min-h-[360px] items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : isError ? (
        <View className="min-h-[360px] justify-center gap-4">
          <Text variant="h1" className="text-center">
            Could not load this discovery.
          </Text>
          <Button title="Try again" onPress={() => refetch()} />
          <Button title="Back to Discoveries" variant="secondary" onPress={goBack} />
        </View>
      ) : album ? (
        <AlbumDetail album={album} />
      ) : (
        <View className="min-h-[360px] justify-center gap-4">
          <Text variant="h1" className="text-center">
            Discovery not found
          </Text>
          <Button
            title="Back to Discoveries"
            onPress={() => router.replace('/(tabs)/discoveries')}
          />
        </View>
      )}
    </Screen>
  );
}
