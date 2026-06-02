import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand/BrandMark';
import { Text } from '@/components/ui/Text';
import {
  bootstrapSpotifySession,
  completeSpotifyOAuthFromUrl,
  getSpotifyRedirectTo,
} from '@/lib/auth';
import { useSkinComponents } from '@/theme/skins/registry';

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
  const { chrome } = useSkinComponents();
  const insets = useSafeAreaInsets();
  const linkingUrl = Linking.useURL();
  const params = useLocalSearchParams() as CallbackParams;
  const [status, setStatus] = useState('Finishing Spotify sign-in...');

  useEffect(() => {
    let mounted = true;

    async function finish() {
      if (__DEV__) {
        console.info('[auth] Callback linkingUrl present:', !!linkingUrl);
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
    <View
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: chrome.rootBackground }}
    >
      <View className="flex-1 items-center justify-center px-5">
        <View className="mb-6 border-2 p-5" style={{ borderColor: chrome.text }}>
          <BrandMark size={64} />
        </View>
        <Text
          className="text-center font-display text-3xl uppercase leading-8"
          style={{ color: chrome.text }}
        >
          Tuning the turntable
        </Text>
        <Text
          className="mt-2 text-center font-mono text-[11px] uppercase leading-4"
          style={{ color: chrome.muted, letterSpacing: 0.8 }}
        >
          {status}
        </Text>
      </View>
    </View>
  );
}
