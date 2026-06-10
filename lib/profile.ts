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

  // Route through the validating RPC instead of a raw profiles update: it
  // rejects invalid timezones server-side and is the only client write path
  // for profiles.timezone. Returns the persisted (validated) zone, or null if
  // the input was rejected.
  const { data: validated, error } = await supabase.rpc('set_profile_timezone_if_valid', {
    p_user_id: userId,
    p_timezone: timezone,
  });
  if (error) throw error;

  return validated != null;
}
