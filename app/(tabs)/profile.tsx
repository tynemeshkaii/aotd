import { useQuery } from '@tanstack/react-query';
import { Alert, View } from 'react-native';

import { useSession } from '@/components/auth/AuthProvider';
import { SyncBanner } from '@/components/library/SyncBanner';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { signOut } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { useLibraryStats } from '@/lib/hooks/useLibraryStats';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useTriggerLibrarySync } from '@/lib/hooks/useTriggerLibrarySync';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) {
        throw new Error('missing_user_id');
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', userId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
  });

  const { data: connection } = useQuery({
    queryKey: ['streaming-connection', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) {
        throw new Error('missing_user_id');
      }

      const { data, error } = await supabase
        .from('streaming_connections_safe')
        .select('provider, connected_at')
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },
  });

  const { data: libraryStats, isLoading: libraryStatsLoading } = useLibraryStats();
  const triggerSync = useTriggerLibrarySync();
  const { status: syncStatus } = useLibrarySyncStatus();
  const isSyncing =
    triggerSync.isPending || syncStatus?.status === 'queued' || syncStatus?.status === 'syncing';

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

  return (
    <Screen>
      <Text variant="h1">Profile</Text>
      <Text variant="caption" className="mt-1 mb-8">
        Spotify account and app session
      </Text>

      {profileLoading ? (
        <Text variant="caption">Loading profile...</Text>
      ) : (
        <View className="items-center rounded-2xl bg-surface px-5 py-8">
          <Avatar label={profile?.display_name} size={104} uri={profile?.avatar_url} />
          <Text variant="h2" className="mt-5 text-center">
            {profile?.display_name ?? 'Spotify listener'}
          </Text>
          {connection ? (
            <Text variant="caption" className="mt-2 text-center">
              Spotify connected
              {connection.connected_at ? ` · ${relativeTime(connection.connected_at)}` : ''}
            </Text>
          ) : (
            <Text variant="caption" className="mt-2 text-center">
              Spotify connection is syncing
            </Text>
          )}

          <View className="mt-6 w-full border-t border-surface-2 pt-5">
            <Text variant="caption" className="text-center">
              Library:{' '}
              {libraryStatsLoading
                ? 'loading...'
                : libraryStats?.albumsTracked == null
                  ? 'not synced yet'
                  : `${libraryStats.albumsTracked} albums tracked`}
            </Text>
            <Text variant="caption" className="mt-2 text-center">
              Last synced: {relativeTime(libraryStats?.lastSyncedAt ?? null)}
            </Text>
          </View>
        </View>
      )}

      <View className="mt-6">
        <SyncBanner />
      </View>

      <Button
        className="mt-2"
        disabled={isSyncing}
        onPress={handleSyncNow}
        title={isSyncing ? 'Syncing…' : 'Sync library now'}
        variant="secondary"
      />

      <Button className="mt-8" title="Log out" variant="ghost" onPress={handleSignOut} />
    </Screen>
  );
}
