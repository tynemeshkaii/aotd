import { useState } from 'react';
import { Alert } from 'react-native';

import { bootstrapSpotifySession, signInWithSpotify } from '@/lib/auth';
import { useAccentFlowFocus } from '@/theme/skins/AccentFlowProvider';
import { useSkinComponents } from '@/theme/skins/registry';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes('spotify_me_failed:403')) {
      return 'Spotify rejected this account. If the app is still in Development Mode, add your Spotify email in Users and Access.';
    }

    if (error.message === 'oauth_cancel' || error.message === 'oauth_dismiss') {
      return 'Spotify sign-in was cancelled.';
    }

    return error.message;
  }

  return String(error);
}

export function SignInController() {
  const components = useSkinComponents();
  useAccentFlowFocus();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      const session = await signInWithSpotify();
      await bootstrapSpotifySession(session);
    } catch (error) {
      Alert.alert('Could not sign in', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return <components.SignInView loading={loading} onSignIn={handleSignIn} />;
}
