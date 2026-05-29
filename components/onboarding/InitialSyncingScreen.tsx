import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Text } from '@/components/ui/Text';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useTriggerLibrarySync } from '@/lib/hooks/useTriggerLibrarySync';
import { isStaleLibrarySync } from '@/lib/library';
import colors from '@/theme/colors';

export function InitialSyncingScreen() {
  const { status } = useLibrarySyncStatus();
  const retry = useTriggerLibrarySync();
  const [showStartRetry, setShowStartRetry] = useState(false);

  useEffect(() => {
    if (status) {
      setShowStartRetry(false);
      return;
    }

    const timer = setTimeout(() => setShowStartRetry(true), 6000);
    return () => clearTimeout(timer);
  }, [status]);

  const total = status?.total_estimate ?? 0;
  const processed = status?.processed_count ?? 0;
  const ratio = total > 0 ? Math.min(processed / total, 1) : 0;

  const isFailed = status?.status === 'failed';
  const isStale = isStaleLibrarySync(status);
  const isStarting = !status || status.status === 'queued';

  return (
    <View className="flex-1 items-center justify-center bg-bg px-8">
      <View className="mb-8 items-center justify-center rounded-full bg-surface p-6">
        <Ionicons name="musical-notes" size={56} color={colors.accent} />
      </View>

      {isFailed || isStale ? (
        <>
          <Text variant="h2" className="text-center">
            {isStale ? 'Sync is taking longer than expected' : "We couldn't read your library"}
          </Text>
          <Text variant="caption" className="mt-3 mb-8 text-center leading-5">
            {isStale
              ? 'You can safely restart the library import.'
              : (status?.error_message ?? 'Unknown error')}
          </Text>
          <Button
            title={retry.isPending ? 'Retrying...' : 'Try again'}
            variant="primary"
            disabled={retry.isPending}
            onPress={() => retry.mutate()}
          />
        </>
      ) : (
        <>
          <Text variant="h2" className="text-center">
            Building your music profile
          </Text>
          <Text variant="caption" className="mt-3 mb-8 text-center leading-5">
            {isStarting ? 'Connecting to Spotify...' : `Importing ${processed} of ${total || '?'}`}
          </Text>
          {!isStarting && total > 0 ? (
            <View className="w-full max-w-xs">
              <ProgressBar ratio={ratio} />
            </View>
          ) : (
            <ActivityIndicator />
          )}
          {showStartRetry ? (
            <Button
              className="mt-8"
              title={retry.isPending ? 'Retrying...' : 'Try again'}
              variant="secondary"
              disabled={retry.isPending}
              onPress={() => retry.mutate()}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
