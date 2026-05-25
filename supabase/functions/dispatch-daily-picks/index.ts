import { createClient } from '@supabase/supabase-js';
import { jsonError, jsonResponse } from '../_shared/cors.ts';

const CONCURRENCY = 5;

type DueUser = {
  user_id: string;
  target_date: string;
  user_tz: string;
};

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'unauthorized');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonError(500, 'missing_supabase_env');
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: due, error } = await admin.rpc('find_users_due_for_compute', {
    p_lead_minutes: 60,
  });
  if (error) return jsonError(500, 'rpc_failed', error.message);
  if (!due || due.length === 0) {
    return jsonResponse({ ok: true, dispatched: 0 });
  }

  let dispatched = 0;
  const dueUsers = due as DueUser[];
  for (let i = 0; i < dueUsers.length; i += CONCURRENCY) {
    const batch = dueUsers.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (u) => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/compute-album-of-the-day`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cronSecret}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: u.user_id,
              target_date: u.target_date,
              user_timezone: u.user_tz,
            }),
          });
          if (res.ok) dispatched += 1;
          else console.warn(`[dispatch] compute failed for ${u.user_id}: ${res.status}`);
        } catch (e) {
          console.warn(`[dispatch] error for ${u.user_id}: ${e instanceof Error ? e.message : e}`);
        }
      }),
    );
  }

  return jsonResponse({ ok: true, dispatched, total_due: due.length });
});
