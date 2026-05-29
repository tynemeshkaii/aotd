import { useState } from 'react';
import { Alert, View } from 'react-native';

import { SpotifyButton } from '@/components/auth/SpotifyButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
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

export default function SignInScreen() {
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

  return (
    <Screen scroll={false}>
      <View className="flex-1 justify-center">
        <View className="mb-12">
          <Text variant="h1" className="text-center text-4xl">
            Album of the Day
          </Text>
          <Text variant="caption" className="mt-3 text-center text-base">
            One album a day, tuned to your taste.
          </Text>
        </View>

        <SpotifyButton disabled={loading} loading={loading} onPress={handleSignIn} />

        <Text variant="caption" className="mt-8 text-center leading-5">
          We read your saved albums and top listening signals so recommendations avoid what you
          already know.
        </Text>
      </View>
    </Screen>
  );
}
