import { useEffect, useState } from 'react';

import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useTriggerLibrarySync } from '@/lib/hooks/useTriggerLibrarySync';
import { isStaleLibrarySync } from '@/lib/library';
import { useAccentFlowFocus } from '@/theme/skins/AccentFlowProvider';
import { useSkinComponents } from '@/theme/skins/registry';

export function InitialSyncingController() {
  const components = useSkinComponents();
  useAccentFlowFocus(false);
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
    <components.InitialSyncingView
      isFailed={isFailed}
      isStale={isStale}
      isStarting={isStarting}
      errorMessage={status?.error_message}
      processed={processed}
      total={total}
      ratio={ratio}
      showStartRetry={showStartRetry}
      retrying={retry.isPending}
      onRetry={() => retry.mutate()}
    />
  );
}
