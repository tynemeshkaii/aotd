import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import { PROFILE_OVERVIEW_KEY } from '@/lib/hooks/useProfileOverview';
import { triggerLibrarySync } from '@/lib/library';

export function useTriggerLibrarySync() {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;
  return useMutation({
    mutationFn: () => triggerLibrarySync('full_reconcile'),
    onSettled: () => {
      // Scope to the signed-in user. `PROFILE_OVERVIEW_KEY()` without a userId
      // produces `['profile-overview', undefined]`, which never partial-matches
      // the active `['profile-overview', userId]` query — so manual sync left
      // the overview stale whenever Realtime was unavailable.
      qc.invalidateQueries({ queryKey: ['library-sync-status', userId] });
      qc.invalidateQueries({ queryKey: ['library-stats', userId] });
      qc.invalidateQueries({ queryKey: PROFILE_OVERVIEW_KEY(userId) });
    },
  });
}
