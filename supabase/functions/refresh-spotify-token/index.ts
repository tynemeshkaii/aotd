import { createClient } from '@supabase/supabase-js';

import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { refreshSpotifyAccessToken } from '../_shared/spotify.ts';

type RefreshBody = {
  user_id?: string;
};

async function parseJsonBody(req: Request): Promise<RefreshBody> {
  const text = await req.text();
  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text) as RefreshBody;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'method_not_allowed');
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonError(500, 'missing_supabase_env');
    }

    const authHeader = req.headers.get('Authorization');
    const apiKey = req.headers.get('apikey');
    const isServiceRequest = authHeader === `Bearer ${serviceRoleKey}` || apiKey === serviceRoleKey;

    let body: RefreshBody;
    try {
      body = await parseJsonBody(req);
    } catch {
      return jsonError(400, 'invalid_json_body');
    }

    let userId = body.user_id;

    if (!isServiceRequest) {
      if (!authHeader) {
        return jsonError(401, 'missing_auth');
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();

      if (userError || !user) {
        return jsonError(401, 'invalid_user');
      }

      if (userId && userId !== user.id) {
        return jsonError(403, 'user_mismatch');
      }

      userId = user.id;
    }

    if (!userId) {
      return jsonError(400, 'missing_user_id');
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: connection, error: connectionError } = await admin
      .from('streaming_connections')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'spotify')
      .maybeSingle();

    if (connectionError) {
      return jsonError(500, 'db_select_failed', connectionError.message);
    }

    if (!connection) {
      return jsonError(404, 'connection_not_found');
    }

    const refreshed = await refreshSpotifyAccessToken(connection.refresh_token);
    const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    const { error: updateError } = await admin
      .from('streaming_connections')
      .update({
        access_token: refreshed.access_token,
        token_expires_at: tokenExpiresAt,
        ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
      })
      .eq('user_id', userId)
      .eq('provider', 'spotify');

    if (updateError) {
      return jsonError(500, 'db_update_failed', updateError.message);
    }

    return jsonResponse({
      ok: true,
      expires_in: refreshed.expires_in,
      token_expires_at: tokenExpiresAt,
      ...(isServiceRequest ? { access_token: refreshed.access_token } : {}),
    });
  } catch (error) {
    return jsonError(500, 'unexpected', error instanceof Error ? error.message : String(error));
  }
});
