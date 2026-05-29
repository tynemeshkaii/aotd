import { createClient } from '@supabase/supabase-js';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';

const CONCURRENCY = 5;

type DueUser = {
  user_id: string;
  target_date: string;
  user_tz: string;
};

type DispatchFailure = {
  user_id: string;
  target_date: string;
  status?: number;
  error: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'unauthorized');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonError(500, 'missing_supabase_env');
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: due, error } = await admin.rpc('find_users_due_for_compute', {
    p_lead_minutes: 60,
    p_catchup_minutes: 720,
  });
  if (error) return jsonError(500, 'rpc_failed', error.message);
  if (!due || due.length === 0) {
    return jsonResponse({ ok: true, dispatched: 0 });
  }

  let dispatched = 0;
  const failed: DispatchFailure[] = [];
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
          if (res.ok) {
            dispatched += 1;
          } else {
            const body = await res.text().catch(() => '');
            const errorBody = body.slice(0, 500);
            failed.push({
              user_id: u.user_id,
              target_date: u.target_date,
              status: res.status,
              error: errorBody || res.statusText,
            });
            console.warn(`[dispatch] compute failed for ${u.user_id}: ${res.status} ${errorBody}`);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          failed.push({
            user_id: u.user_id,
            target_date: u.target_date,
            error: message,
          });
          console.warn(`[dispatch] error for ${u.user_id}: ${message}`);
        }
      }),
    );
  }

  return jsonResponse(
    {
      ok: failed.length === 0,
      dispatched,
      failed_count: failed.length,
      failed,
      total_due: due.length,
    },
    { status: failed.length === 0 ? 200 : dispatched > 0 ? 207 : 500 },
  );
});
