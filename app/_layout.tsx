import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useSession } from '@/components/auth/AuthProvider';
import { Text } from '@/components/ui/Text';
import { queryClient } from '@/lib/queryClient';
import { initSentry } from '@/lib/sentry';

initSentry();

export default function RootLayout() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <RouterGuard />
        </SafeAreaProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

function RouterGuard() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }

    const inSignInGroup = segments[0] === '(auth)';
    const inOAuthCallback = segments[0] === 'auth';

    if (!session && !inSignInGroup && !inOAuthCallback) {
      router.replace('/(auth)/sign-in');
    }

    if (session && inSignInGroup) {
      router.replace('/(tabs)');
    }
  }, [loading, router, segments, session]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-5">
        <Text variant="caption">Loading session...</Text>
      </View>
    );
  }

  return <Slot />;
}
