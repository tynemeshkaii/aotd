import { type RelativePathString, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { DiscoveryListItem } from '@/components/album/DiscoveryListItem';
import { type DiscoveryFilter, StatusTabs } from '@/components/album/StatusTabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useDiscoveries } from '@/lib/hooks/useDiscoveries';

function ListSkeleton() {
  return (
    <View className="mt-4 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
        <View key={i} className="flex-row gap-3 rounded-2xl bg-surface p-3">
          <Skeleton className="h-16 w-16 rounded-xl" />
          <View className="flex-1 justify-center gap-2">
            <Skeleton className="h-4 w-2/3 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
            <Skeleton className="h-3 w-1/3 rounded-md" />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function DiscoveriesScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const { data: discoveries = [], isError, isLoading, isRefetching, refetch } = useDiscoveries();

  useEffect(() => {
    if (params.filter === 'pending' || params.filter === 'rated' || params.filter === 'all') {
      setFilter(params.filter);
    }
  }, [params.filter]);

  const filtered = useMemo(() => {
    if (filter === 'pending') return discoveries.filter((row) => row.status !== 'rated');
    if (filter === 'rated') return discoveries.filter((row) => row.status === 'rated');
    return discoveries;
  }, [discoveries, filter]);

  const emptyTitle =
    filter === 'pending'
      ? 'Nothing waiting. Suspiciously responsible.'
      : filter === 'rated'
        ? 'No journal entries yet.'
        : 'Your first discovery is coming';

  const emptySubtitle =
    filter === 'all'
      ? "Each morning we'll pick one album you don't have yet, based on your taste. Check back tomorrow."
      : undefined;

  return (
    <Screen scroll={false}>
      <Text variant="h1">Discoveries</Text>
      <Text variant="caption" className="mt-1 mb-8">
        Albums we recommended to you
      </Text>

      <StatusTabs value={filter} onChange={setFilter} />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState
          title="Could not load discoveries right now."
          retrying={isRefetching}
          onRetry={() => void refetch()}
        />
      ) : (
        <FlatList
          className="mt-4 flex-1"
          contentContainerClassName={filtered.length ? 'gap-3 pb-8' : 'flex-1'}
          data={filtered}
          keyExtractor={(item) => item.aotd_id}
          renderItem={({ item, index }) => (
            <DiscoveryListItem
              album={item}
              index={index}
              onPress={() => router.push(`/discoveries/${item.aotd_id}` as RelativePathString)}
            />
          )}
          ListEmptyComponent={<EmptyState title={emptyTitle} subtitle={emptySubtitle} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
