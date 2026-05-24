import { supabase } from './supabase';

export async function triggerLibrarySync(): Promise<void> {
  const { error } = await supabase.functions.invoke('sync-spotify-library', { body: {} });
  if (error) throw error;
}
