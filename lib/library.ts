import type { Database } from '@/types/database';

import { supabase } from './supabase';

export const ACTIVE_LIBRARY_SYNC_STALE_MS = 10 * 60 * 1000;

type LibrarySyncStatus = Database['public']['Tables']['library_sync_status']['Row'];
type LibrarySyncStatusLike = Pick<LibrarySyncStatus, 'started_at' | 'status' | 'updated_at'> &
  Partial<Pick<LibrarySyncStatus, 'aggregated_albums_count' | 'completed_at'>>;

export async function triggerLibrarySync(): Promise<void> {
  const { error } = await supabase.functions.invoke('sync-spotify-library', { body: {} });
  if (error) throw error;
}

export function hasCompletedLibrarySync(status: LibrarySyncStatusLike | null) {
  return !!status?.completed_at || status?.aggregated_albums_count != null;
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
