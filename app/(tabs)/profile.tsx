import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { useSession } from '@/components/auth/AuthProvider';
import { SyncBanner } from '@/components/library/SyncBanner';
import { ListeningSummary } from '@/components/profile/ListeningSummary';
import { TasteSection } from '@/components/profile/TasteSection';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { signOut } from '@/lib/auth';
import { copy } from '@/lib/copy';
import { relativeTime } from '@/lib/format';
import { useLibraryStats } from '@/lib/hooks/useLibraryStats';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useProfileOverview } from '@/lib/hooks/useProfileOverview';
import { useTriggerLibrarySync } from '@/lib/hooks/useTriggerLibrarySync';
import { isActiveLibrarySync, isStaleLibrarySync } from '@/lib/library';
import { supabase } from '@/lib/supabase';
import colors from '@/theme/colors';

function productLabel(product?: string | null): string | null {
  if (!product) return null;
  if (product === 'premium') return 'Premium';
  if (product === 'free' || product === 'open') return 'Free';
  return null;
}

export default function ProfileScreen() {
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile, isLoading: profileLoading } = useQuery({
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

  const { data: connection } = useQuery({
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

  const { data: overview, isLoading: overviewLoading } = useProfileOverview();
  const { data: libraryStats, isLoading: libraryStatsLoading } = useLibraryStats();
  const triggerSync = useTriggerLibrarySync();
  const { status: syncStatus } = useLibrarySyncStatus();
  const isSyncing =
    triggerSync.isPending || (isActiveLibrarySync(syncStatus) && !isStaleLibrarySync(syncStatus));

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
  const product = productLabel(connection?.spotify_product);

  return (
    <Screen>
      <Text variant="h1">Profile</Text>
      <Text variant="caption" className="mt-1 mb-6">
        Who you are as a listener
      </Text>

      {/* Hero */}
      <Card className="items-center py-8">
        {profileLoading ? (
          <>
            <Skeleton className="h-[88px] w-[88px] rounded-full" />
            <Skeleton className="mt-5 h-6 w-40 rounded-md" />
            <Skeleton className="mt-3 h-4 w-52 rounded-md" />
          </>
        ) : (
          <>
            <Avatar label={profile?.display_name} size={88} uri={profile?.avatar_url} />
            <Text variant="h2" className="mt-5 text-center">
              {profile?.display_name ?? 'Spotify listener'}
            </Text>
            <Text variant="caption" className="mt-2 text-center">
              {heroSubtitle}
            </Text>
          </>
        )}
      </Card>

      {/* Your taste */}
      <View className="mt-4">
        {overviewLoading ? (
          <Card>
            <Skeleton className="h-5 w-28 rounded-md" />
            <Skeleton className="mt-4 h-8 w-full rounded-md" />
            <Skeleton className="mt-3 h-24 w-full rounded-md" />
          </Card>
        ) : overview ? (
          <TasteSection taste={overview.taste} />
        ) : null}
      </View>

      {/* Listening summary */}
      <View className="mt-4">
        {overviewLoading ? (
          <Card>
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="mt-4 h-12 w-full rounded-md" />
          </Card>
        ) : overview ? (
          <ListeningSummary
            listening={overview.listening}
            onPress={() =>
              router.push({ pathname: '/(tabs)/discoveries', params: { filter: 'rated' } })
            }
          />
        ) : null}
      </View>

      {/* Library status */}
      <View className="mt-4">
        <Card>
          <Text variant="h3">Library</Text>
          <Text variant="caption" className="mt-2">
            {libraryStatsLoading
              ? 'Loading…'
              : libraryStats?.albumsTracked == null
                ? 'Not synced yet'
                : `${libraryStats.albumsTracked} albums tracked`}
            {libraryStats?.lastSyncedAt
              ? ` · synced ${relativeTime(libraryStats.lastSyncedAt)}`
              : ''}
          </Text>
          <SyncBanner />
          <Button
            className="mt-3"
            disabled={isSyncing}
            loading={isSyncing}
            onPress={handleSyncNow}
            title={isSyncing ? 'Syncing…' : 'Sync library now'}
            variant="secondary"
          />
        </Card>
      </View>

      {/* Connections */}
      <View className="mt-4">
        <Card>
          <Text variant="h3">{copy.profile.connectionsTitle}</Text>
          <View className="mt-3 flex-row items-center gap-3">
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            <View className="flex-1">
              <Text variant="body">
                {connection
                  ? `Spotify connected${profile?.display_name ? ` as ${profile.display_name}` : ''}`
                  : 'Spotify connection is syncing'}
              </Text>
              {connection?.connected_at ? (
                <Text variant="subtle" className="mt-0.5">
                  Connected {relativeTime(connection.connected_at)}
                </Text>
              ) : null}
            </View>
            {product ? (
              <View className="rounded-full bg-surface-2 px-3 py-1">
                <Text variant="subtle" className="text-text">
                  {product}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      </View>

      {/* Settings */}
      <View className="mt-4">
        <Card>
          <Text variant="h3">{copy.profile.settingsTitle}</Text>
          <Text variant="caption" className="mt-2">
            Daily reminder time — coming soon.
          </Text>
          <Button className="mt-4" title="Log out" variant="ghost" onPress={handleSignOut} />
        </Card>
      </View>
    </Screen>
  );
}
