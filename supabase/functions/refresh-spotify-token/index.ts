import { createClient } from '@supabase/supabase-js';

import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { parseOptionalJsonBody } from '../_shared/request-body.ts';
import { persistRefreshedSpotifyToken, refreshSpotifyAccessToken } from '../_shared/spotify.ts';

type RefreshBody = {
  user_id?: string;
};

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

    // Validate auth before reading the body: an unauthenticated user request
    // must fail with 401, not leak a 400 invalid_json_body. The body is only
    // parsed after the caller is established (service header or valid JWT).
    let userId: string | undefined;

    if (isServiceRequest) {
      const parsed = parseOptionalJsonBody(await req.text());
      if (!parsed.ok) {
        return jsonError(400, 'invalid_json_body');
      }
      userId = (parsed.value as RefreshBody).user_id;
    } else {
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

      const parsed = parseOptionalJsonBody(await req.text());
      if (!parsed.ok) {
        return jsonError(400, 'invalid_json_body');
      }
      const body = parsed.value as RefreshBody;

      if (body.user_id && body.user_id !== user.id) {
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
      .select('refresh_token, access_token')
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
    // CAS-guarded persist: if a concurrent refresh already rotated the row, we
    // adopt the persisted token instead of clobbering it.
    const { accessToken, tokenExpiresAt } = await persistRefreshedSpotifyToken(
      admin,
      userId,
      refreshed,
      connection.access_token,
    );

    return jsonResponse({
      ok: true,
      expires_in: refreshed.expires_in,
      token_expires_at: tokenExpiresAt,
      ...(isServiceRequest ? { access_token: accessToken } : {}),
    });
  } catch (error) {
    return jsonError(500, 'unexpected', error instanceof Error ? error.message : String(error));
  }
});
