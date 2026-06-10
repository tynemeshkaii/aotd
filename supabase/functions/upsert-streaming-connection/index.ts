import { createClient } from '@supabase/supabase-js';

import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { parseOptionalJsonBody } from '../_shared/request-body.ts';
import { fetchSpotifyProfile } from '../_shared/spotify.ts';

type UpsertBody = {
  provider_token?: string;
  provider_refresh_token?: string;
  expires_in?: number;
  scopes?: string[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'method_not_allowed');
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonError(401, 'missing_auth');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonError(500, 'missing_supabase_env');
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
    const body = parsed.value as UpsertBody;

    if (!body.provider_token) {
      return jsonError(400, 'missing_provider_token');
    }

    const spotifyProfile = await fetchSpotifyProfile(body.provider_token);
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingConnection, error: existingError } = await admin
      .from('streaming_connections')
      .select('refresh_token')
      .eq('user_id', user.id)
      .eq('provider', 'spotify')
      .maybeSingle();

    if (existingError) {
      return jsonError(500, 'db_select_failed', existingError.message);
    }

    const refreshToken = body.provider_refresh_token ?? existingConnection?.refresh_token;
    if (!refreshToken) {
      return jsonError(400, 'missing_provider_refresh_token');
    }

    // Guard against a non-positive expires_in: a 0/negative value would stamp
    // token_expires_at in the past and force perpetual refreshes.
    const rawExpiresIn = Number(body.expires_in);
    const expiresIn = Number.isFinite(rawExpiresIn) && rawExpiresIn > 0 ? rawExpiresIn : 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // scopes is a text[] column; keep only string entries so a malformed
    // payload can't write non-string array elements.
    const scopes = Array.isArray(body.scopes)
      ? body.scopes.filter((scope): scope is string => typeof scope === 'string')
      : [];

    const { error: upsertError } = await admin.from('streaming_connections').upsert(
      {
        user_id: user.id,
        provider: 'spotify',
        provider_user_id: spotifyProfile.id,
        access_token: body.provider_token,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        scopes,
        spotify_product: spotifyProfile.product ?? null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    );

    if (upsertError) {
      return jsonError(500, 'db_upsert_failed', upsertError.message);
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        display_name: spotifyProfile.display_name ?? null,
        avatar_url: spotifyProfile.images?.[0]?.url ?? null,
      })
      .eq('id', user.id);

    if (profileError) {
      return jsonError(500, 'profile_update_failed', profileError.message);
    }

    return jsonResponse({ ok: true, provider_user_id: spotifyProfile.id });
  } catch (error) {
    return jsonError(500, 'unexpected', error instanceof Error ? error.message : String(error));
  }
});
