import { View } from 'react-native';

import { editorialColors, tracking } from '@/components/skins/shared/skinStyles';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Text } from '@/components/ui/Text';
import { type LibrarySyncStatus, useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { isStaleLibrarySync } from '@/lib/library';
import type { SkinComponentSet } from '@/theme/skins/types';

function syncFailureCopy(status: LibrarySyncStatus) {
  if (status.error_code === 'spotify_rate_limited') {
    return 'Spotify asked us to slow down. Try syncing again in a little while.';
  }

  return 'Library sync could not finish. Try syncing again.';
}

export function EditorialSyncBanner({
  status: statusOverride,
}: Parameters<SkinComponentSet['SyncBanner']>[0] = {}) {
  if (statusOverride !== undefined) {
    return <EditorialSyncBannerContent status={statusOverride} />;
  }

  return <EditorialLiveSyncBanner />;
}

function EditorialLiveSyncBanner() {
  const { status } = useLibrarySyncStatus();

  return <EditorialSyncBannerContent status={status} />;
}

function EditorialSyncBannerContent({ status }: { status: LibrarySyncStatus | null }) {
  if (!status || status.status === 'idle' || status.status === 'completed') return null;
  const isStale = isStaleLibrarySync(status);

  if (status.status === 'failed' || isStale) {
    return (
      <View
        className="border-2 px-4 py-3"
        style={{ borderColor: editorialColors.red, backgroundColor: editorialColors.paper }}
      >
        <Text
          className="mb-2 font-mono-bold text-[10px] uppercase leading-4"
          style={{ color: editorialColors.red, letterSpacing: tracking.label }}
        >
          Sync notice
        </Text>
        <Text className="font-prose text-sm leading-5" style={{ color: editorialColors.ink }}>
          {isStale
            ? 'Sync is taking longer than expected. You can try again now.'
            : syncFailureCopy(status)}
        </Text>
      </View>
    );
  }

  const total = status.total_estimate ?? 0;
  const processed = status.processed_count ?? 0;
  const ratio = total > 0 ? processed / total : 0;

  return (
    <View
      className="border-2 px-4 py-3"
      style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.paperAlt }}
    >
      <Text
        className="mb-1 font-mono-bold text-[10px] uppercase leading-4"
        style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
      >
        Library import
      </Text>
      <Text
        className="mb-2 font-mono text-[11px] uppercase leading-4"
        style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
      >
        Importing your library... {processed} / {total || '?'}
      </Text>
      <ProgressBar
        ratio={ratio}
        height={8}
        bordered
        trackColor={editorialColors.paper}
        fillColor={editorialColors.accentStatic}
        borderColor={editorialColors.ink}
      />
    </View>
  );
}
