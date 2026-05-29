import { supabase } from './supabase';

export function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export async function syncDeviceTimeZone(userId: string) {
  const timezone = getDeviceTimeZone();
  if (!timezone) return false;

  // Skip the write when the stored timezone already matches the device — this
  // runs once per app session, so avoid a redundant UPDATE (and the resulting
  // today-pick invalidation) when nothing actually changed.
  const { data: existing } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();

  if (existing?.timezone === timezone) return false;

  const { error } = await supabase.from('profiles').update({ timezone }).eq('id', userId);
  if (error) throw error;

  return true;
}
