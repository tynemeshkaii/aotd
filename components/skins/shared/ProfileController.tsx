import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useSession } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/auth';
import { copy } from '@/lib/copy';
import { useLibraryStats } from '@/lib/hooks/useLibraryStats';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useProfileOverview } from '@/lib/hooks/useProfileOverview';
import { useTriggerLibrarySync } from '@/lib/hooks/useTriggerLibrarySync';
import { isActiveLibrarySync, isStaleLibrarySync } from '@/lib/library';
import { supabase } from '@/lib/supabase';
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
  const { session } = useSession();
  const userId = session?.user.id;

  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error('missing_user_id');
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: connection, refetch: refetchConnection } = useQuery({
    queryKey: ['streaming-connection', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error('missing_user_id');
      const { data, error } = await supabase
        .from('streaming_connections_safe')
        .select('provider, connected_at, spotify_product')
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const {
    data: overview,
    isLoading: overviewLoading,
    isRefetching: overviewRefetching,
    refetch: refetchOverview,
  } = useProfileOverview();
  const {
    data: libraryStats,
    isLoading: libraryStatsLoading,
    refetch: refetchLibraryStats,
  } = useLibraryStats();
  const triggerSync = useTriggerLibrarySync();
  const { status: syncStatus } = useLibrarySyncStatus();
  const isSyncing =
    triggerSync.isPending || (isActiveLibrarySync(syncStatus) && !isStaleLibrarySync(syncStatus));

  const handleRefresh = () => {
    void refetchProfile();
    void refetchConnection();
    void refetchOverview();
    void refetchLibraryStats();
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
      libraryStats={libraryStats}
      libraryStatsLoading={libraryStatsLoading}
      syncStatus={syncStatus}
      isSyncing={isSyncing}
      onSyncNow={handleSyncNow}
      onSignOut={handleSignOut}
      onOpenRatedDiscoveries={() =>
        router.push({ pathname: '/(tabs)/discoveries', params: { filter: 'rated' } })
      }
      product={productLabel(connection?.spotify_product)}
      heroSubtitle={heroSubtitle}
      refreshing={overviewRefetching}
      onRefresh={handleRefresh}
    />
  );
}
