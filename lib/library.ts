import type { Database } from '@/types/database';

import { getDeviceTimeZone } from './profile';
import { supabase } from './supabase';

export const ACTIVE_LIBRARY_SYNC_STALE_MS = 10 * 60 * 1000;

export type LibrarySyncMode = 'initial' | 'bounded' | 'full_reconcile';

type LibrarySyncStatus = Database['public']['Tables']['library_sync_status']['Row'];
type LibrarySyncStatusLike = Pick<LibrarySyncStatus, 'started_at' | 'status' | 'updated_at'> &
  Partial<Pick<LibrarySyncStatus, 'aggregated_albums_count' | 'completed_at'>>;

export async function triggerLibrarySync(
  mode: LibrarySyncMode = 'full_reconcile',
  opts?: { deviceTimezone?: string },
): Promise<void> {
  const body: Record<string, unknown> = { mode };
  const deviceTimezone = opts?.deviceTimezone ?? getDeviceTimeZone();
  if (deviceTimezone) {
    body.device_timezone = deviceTimezone;
  }
  const { error } = await supabase.functions.invoke('sync-spotify-library', { body });
  if (error) throw error;
}

export function hasCompletedLibrarySync(status: LibrarySyncStatusLike | null) {
  return status?.status === 'completed' || status?.aggregated_albums_count != null;
}

export function isActiveLibrarySync(status: LibrarySyncStatusLike | null) {
  return status?.status === 'queued' || status?.status === 'syncing';
}

export function isStaleLibrarySync(status: LibrarySyncStatusLike | null, now = Date.now()) {
  if (!isActiveLibrarySync(status)) return false;

  const lastTouch = status?.updated_at ?? status?.started_at;
  if (!lastTouch) return false;

  return now - new Date(lastTouch).getTime() > ACTIVE_LIBRARY_SYNC_STALE_MS;
}
