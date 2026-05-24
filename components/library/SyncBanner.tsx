import { View } from 'react-native';

import { ProgressBar } from '@/components/ui/ProgressBar';
import { Text } from '@/components/ui/Text';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';

export function SyncBanner() {
  const { status } = useLibrarySyncStatus();
  if (!status || status.status === 'idle' || status.status === 'completed') return null;

  if (status.status === 'failed') {
    return (
      <View className="mb-3 rounded-xl bg-surface px-4 py-3">
        <Text variant="caption" className="text-text">
          Sync failed: {status.error_message ?? 'unknown error'}. Try again from Profile.
        </Text>
      </View>
    );
  }

  const total = status.total_estimate ?? 0;
  const processed = status.processed_count ?? 0;
  const ratio = total > 0 ? processed / total : 0;

  return (
    <View className="mb-3 rounded-xl bg-surface px-4 py-3">
      <Text variant="caption" className="mb-2">
        Importing your library… {processed} / {total || '?'}
      </Text>
      <ProgressBar ratio={ratio} />
    </View>
  );
}
