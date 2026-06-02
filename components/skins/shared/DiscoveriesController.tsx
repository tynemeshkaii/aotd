import { type RelativePathString, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import type { DiscoveryFilter } from '@/components/album/StatusTabs';
import { useDiscoveries } from '@/lib/hooks/useDiscoveries';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { useAccentFlowFocus } from '@/theme/skins/AccentFlowProvider';
import { useSkinComponents } from '@/theme/skins/registry';

export function DiscoveriesController() {
  const components = useSkinComponents();
  useAccentFlowFocus();
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
      ? 'No waiting issues'
      : filter === 'rated'
        ? 'Your journal is still blank'
        : 'Your first discovery is coming';

  const emptySubtitle =
    filter === 'all'
      ? "Each morning we'll pick one album you don't have yet, based on your taste."
      : filter === 'pending'
        ? 'Every open issue has already been filed, which is annoyingly responsible.'
        : 'Rate a discovery and it will land here as part of your private listening journal.';

  const openDiscovery = (album: AlbumDiscovery) => {
    router.push(`/discoveries/${album.aotd_id}` as RelativePathString);
  };

  return (
    <components.DiscoveriesView
      filter={filter}
      onFilterChange={setFilter}
      discoveries={discoveries}
      filtered={filtered}
      loading={isLoading}
      error={isError}
      retrying={isRefetching}
      onRetry={() => void refetch()}
      onOpenDiscovery={openDiscovery}
      emptyTitle={emptyTitle}
      emptySubtitle={emptySubtitle}
    />
  );
}
