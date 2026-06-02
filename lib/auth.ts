import type { Session } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';

import { triggerLibrarySync } from './library';
import { syncDeviceTimeZone } from './profile';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export const SPOTIFY_SCOPES = ['user-library-read', 'user-top-read', 'user-read-private'] as const;

// Spotify access tokens always expire after 3600s. The Edge Function derives
// `token_expires_at` from this value; keep it in sync if Spotify ever changes.
const SPOTIFY_TOKEN_TTL_SECONDS = 3600;

// Both the sign-in screen and the explicit /auth/callback route can resolve the
// same OAuth session. Dedupe the post-auth bootstrap (connection upsert +
// timezone sync + initial library sync) so we don't double-hit Spotify /me —
// extra calls in Development Mode risk a 429 cascade that breaks login.
const bootstrapInFlight = new Map<string, Promise<void>>();

let activeCallbackUrl: string | null = null;
let activeCallbackPromise: Promise<Session | null> | null = null;
let completedCallbackUrl: string | null = null;

export function getSpotifyRedirectTo() {
  return AuthSession.makeRedirectUri({
    native: 'albumoftheday://auth/callback',
    path: 'auth/callback',
  });
}

async function createSessionFromUrl(url: string): Promise<Session | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  if (params.error) {
    throw new Error(params.error_description ?? params.error);
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      throw error;
    }

    return data.session;
  }

  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });

    if (error) {
      throw error;
    }

    return data.session;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    return data.session;
  }

  throw new Error('missing_oauth_callback_params');
}

export async function completeSpotifyOAuthFromUrl(url: string) {
  if (completedCallbackUrl === url) {
    return (await supabase.auth.getSession()).data.session;
  }

  if (activeCallbackUrl === url && activeCallbackPromise) {
    return activeCallbackPromise;
  }

  activeCallbackUrl = url;
  activeCallbackPromise = createSessionFromUrl(url);

  try {
    const session = await activeCallbackPromise;
    completedCallbackUrl = url;
    return session;
  } finally {
    activeCallbackUrl = null;
    activeCallbackPromise = null;
  }
}

export async function signInWithSpotify() {
  const redirectTo = getSpotifyRedirectTo();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      redirectTo,
      scopes: SPOTIFY_SCOPES.join(' '),
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  if (!data.url) {
    throw new Error('missing_oauth_url');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });

  if (result.type !== 'success') {
    throw new Error(`oauth_${result.type}`);
  }

  return completeSpotifyOAuthFromUrl(result.url);
}

export async function syncSpotifyConnection(session?: Session | null) {
  const currentSession = session ?? (await supabase.auth.getSession()).data.session;

  if (!currentSession?.provider_token) {
    throw new Error('missing_provider_token');
  }

  const { error } = await supabase.functions.invoke('upsert-streaming-connection', {
    body: {
      provider_token: currentSession.provider_token,
      provider_refresh_token: currentSession.provider_refresh_token,
      expires_in: SPOTIFY_TOKEN_TTL_SECONDS,
      scopes: [...SPOTIFY_SCOPES],
    },
  });

  if (error) {
    throw error;
  }
}

/**
 * Runs the one-time post-OAuth setup for a freshly authenticated session:
 * upsert the Spotify connection, sync the device timezone, and kick off the
 * initial library import (fire-and-forget). Safe to call from both the sign-in
 * screen and the /auth/callback route — it dedupes per user for the lifetime of
 * the JS context, and a failed run clears so the next attempt can retry.
 */
export function bootstrapSpotifySession(session: Session | null): Promise<void> {
  if (!session) {
    return Promise.reject(new Error('missing_session'));
  }

  const userId = session.user.id;
  const existing = bootstrapInFlight.get(userId);
  if (existing) {
    return existing;
  }

  const run = (async () => {
    await syncSpotifyConnection(session);

    await syncDeviceTimeZone(userId).catch((error) => {
      if (__DEV__) {
        console.warn('[profile] timezone sync skipped:', error);
      }
    });

    // Initial sync is fire-and-forget. The splash picks up status via Realtime.
    triggerLibrarySync('initial').catch((error) => {
      if (__DEV__) {
        console.warn('[initial-sync] failed:', error);
      }
    });
  })();

  bootstrapInFlight.set(userId, run);
  // Only the connection upsert can reject here; clear on failure so a retry
  // (e.g. user taps sign-in again) isn't permanently suppressed.
  run.catch(() => bootstrapInFlight.delete(userId));
  return run;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
  // Clear bootstrap dedupe so a fresh sign-in (even same user, same app
  // session) re-runs the connection upsert and saves the new provider token.
  bootstrapInFlight.clear();
}
