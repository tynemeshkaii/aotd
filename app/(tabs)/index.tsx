import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumDetail } from '@/components/album/AlbumDetail';
import { Text } from '@/components/ui/Text';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useProfileOverview } from '@/lib/hooks/useProfileOverview';
import { useTodayPick } from '@/lib/hooks/useTodayPick';
import { useUnratedPastPickCount } from '@/lib/hooks/useUnratedPastPickCount';
import { hasCompletedLibrarySync } from '@/lib/library';
import { useTabContentBottomPadding } from '@/lib/navigationChrome';
import { useSkinComponents } from '@/theme/skins/registry';

function HomeStateShell({ children }: { children: ReactNode }) {
  const { chrome } = useSkinComponents();
  const insets = useSafeAreaInsets();
  const bottomPadding = useTabContentBottomPadding();

  return (
    <View
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: chrome.rootBackground }}
    >
      <View className="flex-1 px-5 pt-4" style={{ paddingBottom: bottomPadding }}>
        {children}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const components = useSkinComponents();
  const { chrome } = components;
  const { data: pick, isError, isLoading, isRefetching, refetch } = useTodayPick();
  const { data: oldPendingCount = 0 } = useUnratedPastPickCount(pick?.aotd_id);
  const { status: syncStatus } = useLibrarySyncStatus();
  const { data: overview } = useProfileOverview();

  // Loading: pick skeleton (not a blank screen).
  if (isLoading) {
    return (
      <HomeStateShell>
        <View className="mt-5">{components.States.AlbumDetailSkeleton()}</View>
      </HomeStateShell>
    );
  }

  // Error: retryable — never masked as "waiting".
  if (isError) {
    return (
      <HomeStateShell>
        {components.States.PickError({ onRetry: () => void refetch(), retrying: isRefetching })}
      </HomeStateShell>
    );
  }

  // No row for today (successful response): brewing or first-pick building.
  if (!pick) {
    const syncCompleted = hasCompletedLibrarySync(syncStatus);
    const isFirstPick = overview?.total_discovered === 0;
    const libraryAlbumCount = syncStatus?.aggregated_albums_count ?? 0;
    return (
      <HomeStateShell>
        {components.States.WaitingForPick({ syncCompleted, isFirstPick, libraryAlbumCount })}
      </HomeStateShell>
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
        className="border-2 px-4 py-3 active:opacity-80"
        style={{ borderColor: chrome.text, backgroundColor: chrome.rootBackground }}
      >
        <Text className="font-prose text-sm leading-5" style={{ color: chrome.text }}>
          A few past picks are still waiting whenever you are.
        </Text>
      </Pressable>
    ) : null;

  return (
    <AlbumDetail
      album={pick}
      isToday
      footer={footer}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    />
  );
}
