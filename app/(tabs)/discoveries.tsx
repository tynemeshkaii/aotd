import { type RelativePathString, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { DiscoveryListItem } from '@/components/album/DiscoveryListItem';
import { type DiscoveryFilter, StatusTabs } from '@/components/album/StatusTabs';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useDiscoveries } from '@/lib/hooks/useDiscoveries';

export default function DiscoveriesScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const { data: discoveries = [], isError, isLoading, refetch } = useDiscoveries();

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

  return (
    <Screen scroll={false}>
      <Text variant="h1">Discoveries</Text>
      <Text variant="caption" className="mt-1 mb-8">
        Albums we recommended to you
      </Text>

      <StatusTabs value={filter} onChange={setFilter} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : isError ? (
        <View className="flex-1 justify-center gap-4 px-8">
          <Text variant="h2" className="text-center">
            Could not load discoveries right now.
          </Text>
          <Button title="Try again" onPress={() => refetch()} />
        </View>
      ) : (
        <FlatList
          className="mt-4 flex-1"
          contentContainerClassName={filtered.length ? 'gap-3 pb-8' : 'flex-1 justify-center px-8'}
          data={filtered}
          keyExtractor={(item) => item.aotd_id}
          renderItem={({ item }) => (
            <DiscoveryListItem
              album={item}
              onPress={() => router.push(`/discoveries/${item.aotd_id}` as RelativePathString)}
            />
          )}
          ListEmptyComponent={
            <View className="items-center">
              <Text variant="h2" className="text-center">
                {emptyTitle}
              </Text>
              {filter === 'all' && (
                <Text variant="caption" className="mt-3 text-center leading-5">
                  Each morning we'll pick one album you don't have yet, based on your taste. Check
                  back tomorrow.
                </Text>
              )}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
