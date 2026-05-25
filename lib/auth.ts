import type { Session } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export const SPOTIFY_SCOPES = ['user-library-read', 'user-top-read', 'user-read-private'] as const;

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
  if (__DEV__) {
    console.info('[auth] Spotify redirectTo:', redirectTo);
  }

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

  if (__DEV__) {
    const oauthUrl = new URL(data.url);
    console.info('[auth] Supabase OAuth redirect_to:', oauthUrl.searchParams.get('redirect_to'));
    console.info('[auth] Supabase OAuth provider URL:', oauthUrl.origin + oauthUrl.pathname);
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
      expires_in: 3600,
      scopes: [...SPOTIFY_SCOPES],
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
