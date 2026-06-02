import { useMutation, useQueryClient } from '@tanstack/react-query';

import { PROFILE_OVERVIEW_KEY } from '@/lib/hooks/useProfileOverview';
import { triggerLibrarySync } from '@/lib/library';

export function useTriggerLibrarySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => triggerLibrarySync('full_reconcile'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['library-sync-status'] });
      qc.invalidateQueries({ queryKey: ['library-stats'] });
      qc.invalidateQueries({ queryKey: PROFILE_OVERVIEW_KEY() });
    },
  });
}
