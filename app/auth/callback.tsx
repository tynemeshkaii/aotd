import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  bootstrapSpotifySession,
  completeSpotifyOAuthFromUrl,
  getSpotifyRedirectTo,
} from '@/lib/auth';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type CallbackParams = Record<string, string | string[] | undefined>;
const OAUTH_PARAM_KEYS = ['code', 'access_token', 'refresh_token', 'error'] as const;

function getParam(params: CallbackParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function getUrlParam(url: string | null, key: string) {
  if (!url) {
    return null;
  }

  const parsedUrl = new URL(url, 'https://phony.example');
  const queryValue = parsedUrl.searchParams.get(key);
  if (queryValue) {
    return queryValue;
  }

  return new URLSearchParams(parsedUrl.hash.replace(/^#/, '')).get(key);
}

function getParamKeys(params: CallbackParams) {
  return Object.keys(params).sort();
}

function hasOAuthParams(url: string | null, params: CallbackParams) {
  return OAUTH_PARAM_KEYS.some((key) => getUrlParam(url, key) || getParam(params, key));
}

function buildCallbackUrl(url: string | null, params: CallbackParams) {
  if (url && hasOAuthParams(url, {})) {
    return url;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, item);
      }
    } else {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();
  if (!queryString) {
    return null;
  }

  return `${getSpotifyRedirectTo()}?${queryString}`;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const linkingUrl = Linking.useURL();
  const params = useLocalSearchParams() as CallbackParams;
  const [status, setStatus] = useState('Finishing Spotify sign-in...');

  useEffect(() => {
    let mounted = true;

    async function finish() {
      if (__DEV__) {
        console.info('[auth] Callback linkingUrl:', linkingUrl);
        console.info('[auth] Callback param keys:', getParamKeys(params));
      }

      if (!hasOAuthParams(linkingUrl, params)) {
        setStatus('Waiting for Spotify callback...');
        return;
      }

      const callbackUrl = buildCallbackUrl(linkingUrl, params);
      if (!callbackUrl) {
        setStatus('Waiting for Spotify callback...');
        return;
      }

      try {
        const session = await completeSpotifyOAuthFromUrl(callbackUrl);
        await bootstrapSpotifySession(session);

        if (mounted) {
          router.replace('/(tabs)');
        }
      } catch (error) {
        if (mounted) {
          const message = getErrorMessage(error);
          setStatus(message);
          Alert.alert('Could not finish sign-in', message);
          router.replace('/(auth)/sign-in');
        }
      }
    }

    finish();

    return () => {
      mounted = false;
    };
  }, [linkingUrl, params, router]);

  return (
    <Screen scroll={false}>
      <View className="flex-1 items-center justify-center px-5">
        <Text variant="caption" className="text-center">
          {status}
        </Text>
      </View>
    </Screen>
  );
}
