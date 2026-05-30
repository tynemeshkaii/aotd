import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AlbumDetail } from '@/components/album/AlbumDetail';
import { AlbumDetailSkeleton } from '@/components/album/AlbumDetailSkeleton';
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

  // Loading: pick skeleton (not a blank screen).
  if (isLoading) {
    return (
      <Screen>
        <Text variant="h1">Today</Text>
        <View className="mt-5">
          <AlbumDetailSkeleton />
        </View>
      </Screen>
    );
  }

  // Error: retryable — never masked as "waiting".
  if (isError) {
    return (
      <Screen>
        <Text variant="h1" className="mb-5">
          Today
        </Text>
        <PickError onRetry={() => void refetch()} retrying={isRefetching} />
      </Screen>
    );
  }

  // No row for today (successful response): brewing.
  if (!pick) {
    return (
      <Screen>
        <Text variant="h1">Today</Text>
        <WaitingForPick />
      </Screen>
    );
  }

  // Today's pick: full-bleed rich treatment.
  const footer =
    oldPendingCount > 0 ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.push({ pathname: '/(tabs)/discoveries', params: { filter: 'pending' } });
        }}
        className="rounded-2xl bg-surface px-4 py-3 active:opacity-80"
      >
        <Text variant="body">A few past picks are still waiting whenever you are.</Text>
      </Pressable>
    ) : null;

  return <AlbumDetail album={pick} isToday footer={footer} />;
}
