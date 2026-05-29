import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AlbumDetail } from '@/components/album/AlbumDetail';
import { PickError } from '@/components/home/PickError';
import { WaitingForPick } from '@/components/home/WaitingForPick';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useDiscoveries } from '@/lib/hooks/useDiscoveries';
import { useTodayPick } from '@/lib/hooks/useTodayPick';

export default function HomeScreen() {
  const { data: pick, isError, isLoading, isRefetching, refetch } = useTodayPick();
  const { data: discoveries } = useDiscoveries();
  const oldPendingCount =
    discoveries?.filter((row) => row.status !== 'rated' && row.aotd_id !== pick?.aotd_id).length ??
    0;

  return (
    <Screen>
      <Text variant="h1">Today</Text>
      <View className="mt-5">
        {isLoading ? null : isError ? (
          <PickError onRetry={() => void refetch()} retrying={isRefetching} />
        ) : pick ? (
          <AlbumDetail album={pick} isToday />
        ) : (
          <WaitingForPick />
        )}
      </View>
      {oldPendingCount > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push({ pathname: '/(tabs)/discoveries', params: { filter: 'pending' } });
          }}
          className="mt-5 rounded-lg bg-surface px-4 py-3 active:opacity-80"
        >
          <Text variant="body">A few past picks are still waiting whenever you are.</Text>
        </Pressable>
      )}
    </Screen>
  );
}
