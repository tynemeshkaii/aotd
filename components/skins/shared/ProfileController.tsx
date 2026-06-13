import { router } from 'expo-router';
import { Alert } from 'react-native';

import { signOut } from '@/lib/auth';
import { copy } from '@/lib/copy';
import { useDiscoveries } from '@/lib/hooks/useDiscoveries';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useProfileIdentity } from '@/lib/hooks/useProfileIdentity';
import { useProfileOverview } from '@/lib/hooks/useProfileOverview';
import { useSpotifyConnection } from '@/lib/hooks/useSpotifyConnection';
import { useTriggerLibrarySync } from '@/lib/hooks/useTriggerLibrarySync';
import { isActiveLibrarySync, isStaleLibrarySync } from '@/lib/library';
import { buildStreakSummary } from '@/lib/streak';
import { useAccentFlowFocus } from '@/theme/skins/AccentFlowProvider';
import { useSkinComponents } from '@/theme/skins/registry';

function productLabel(product?: string | null): string | null {
  if (!product) return null;
  if (product === 'premium') return 'Premium';
  if (product === 'free' || product === 'open') return 'Free';
  return null;
}

export function ProfileController() {
  const components = useSkinComponents();
  useAccentFlowFocus();

  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useProfileIdentity();

  const { data: connection, refetch: refetchConnection } = useSpotifyConnection();
  const { data: discoveries = [] } = useDiscoveries({ limit: 60 });

  const {
    data: overview,
    isLoading: overviewLoading,
    isRefetching: overviewRefetching,
    refetch: refetchOverview,
  } = useProfileOverview();
  const triggerSync = useTriggerLibrarySync();
  const { status: syncStatus, refetch: refetchSyncStatus } = useLibrarySyncStatus();
  const isSyncing =
    triggerSync.isPending || (isActiveLibrarySync(syncStatus) && !isStaleLibrarySync(syncStatus));

  const handleRefresh = () => {
    void refetchProfile();
    void refetchConnection();
    void refetchOverview();
    void refetchSyncStatus();
  };

  const handleSyncNow = () => {
    triggerSync.mutate(undefined, {
      onError: (error) => {
        Alert.alert('Sync failed', error instanceof Error ? error.message : String(error));
      },
    });
  };

  const handleSignOut = () => {
    Alert.alert('Log out?', 'Your Spotify connection stays saved for the next login.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: signOut },
    ]);
  };

  const streak = overview?.streak ?? 0;
  const discovered = overview?.total_discovered ?? 0;
  const heroSubtitle =
    streak > 0
      ? `${copy.profile.streak(streak)} · ${copy.profile.discovered(discovered)}`
      : discovered > 0
        ? copy.profile.discovered(discovered)
        : copy.profile.noStreak;

  return (
    <components.ProfileView
      profile={profile}
      profileLoading={profileLoading}
      connection={connection}
      overview={overview}
      overviewLoading={overviewLoading}
      libraryStats={{
        albumsTracked: overview?.library_stats.albums_tracked ?? null,
        lastSyncedAt: overview?.library_stats.last_synced_at ?? null,
      }}
      libraryStatsLoading={overviewLoading}
      syncStatus={syncStatus}
      isSyncing={isSyncing}
      onSyncNow={handleSyncNow}
      onSignOut={handleSignOut}
      onOpenRatedDiscoveries={() =>
        router.push({ pathname: '/(tabs)/discoveries', params: { filter: 'rated' } })
      }
      product={productLabel(connection?.spotify_product)}
      heroSubtitle={heroSubtitle}
      streakRun={buildStreakSummary(discoveries, discoveries[0]?.pick_date, overview?.streak ?? 0)}
      refreshing={overviewRefetching}
      onRefresh={handleRefresh}
    />
  );
}
