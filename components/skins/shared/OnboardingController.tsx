import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback } from 'react';

import { useAccentFlowFocus } from '@/theme/skins/AccentFlowProvider';
import { useSkinComponents } from '@/theme/skins/registry';
import { useSpotifySignIn } from './useSpotifySignIn';

export const ONBOARDING_SEEN_KEY = 'onboarding_seen';

export async function markOnboardingSeen() {
  await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, '1').catch(() => undefined);
}

export async function hasSeenOnboarding() {
  return (await SecureStore.getItemAsync(ONBOARDING_SEEN_KEY).catch(() => null)) === '1';
}

export function OnboardingController() {
  const components = useSkinComponents();
  const router = useRouter();
  useAccentFlowFocus();

  const handleExistingSignIn = useCallback(async () => {
    await markOnboardingSeen();
    router.replace('/(auth)/sign-in');
  }, [router]);

  const { loading, handleSignIn } = useSpotifySignIn(markOnboardingSeen);

  return (
    <components.OnboardingView
      loading={loading}
      onConnect={handleSignIn}
      onExistingSignIn={handleExistingSignIn}
    />
  );
}
