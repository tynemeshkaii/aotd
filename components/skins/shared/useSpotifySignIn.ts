import { useState } from 'react';
import { Alert } from 'react-native';

import { bootstrapSpotifySession, signInWithSpotify } from '@/lib/auth';

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

export function useSpotifySignIn(onSuccess?: () => Promise<void> | void) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      const session = await signInWithSpotify();
      await bootstrapSpotifySession(session);
      await onSuccess?.();
    } catch (error) {
      Alert.alert('Could not sign in', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return { loading, handleSignIn };
}
