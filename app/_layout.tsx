import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useSession } from '@/components/auth/AuthProvider';
import { BrandMark } from '@/components/brand/BrandMark';
import { InitialSyncingScreen } from '@/components/onboarding/InitialSyncingScreen';
import { Text } from '@/components/ui/Text';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { hasCompletedLibrarySync } from '@/lib/library';
import { queryClient } from '@/lib/queryClient';
import { initSentry } from '@/lib/sentry';
import { AccentFlowProvider } from '@/theme/skins/AccentFlowProvider';
import { useSkinFonts } from '@/theme/skins/fonts';
import { useSkinComponents } from '@/theme/skins/registry';

initSentry();

export default function RootLayout() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AccentFlowProvider>
            <SkinGate />
          </AccentFlowProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

function BootSplash({ label }: { label: string }) {
  const components = useSkinComponents();
  return (
    <View
      className="flex-1 items-center justify-center gap-5 px-8"
      style={{ backgroundColor: components.chrome.rootBackground }}
    >
      <BrandMark size={60} muted />
      <Text
        className="text-center font-mono text-[11px] uppercase"
        style={{ color: components.chrome.muted, letterSpacing: 1 }}
      >
        {label}
      </Text>
    </View>
  );
}

function SkinGate() {
  const [fontsLoaded] = useSkinFonts();
  const components = useSkinComponents();

  if (!fontsLoaded) {
    return <BootSplash label="Loading" />;
  }

  return (
    <>
      <StatusBar style={components.chrome.statusBarStyle} />
      <RouterGuard />
    </>
  );
}

function RouterGuard() {
  const { session, loading } = useSession();
  const { status: syncStatus, loading: syncStatusLoading } = useLibrarySyncStatus();
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
    return <BootSplash label="Loading session" />;
  }

  if (session && syncStatusLoading) {
    return <BootSplash label="Loading music profile" />;
  }

  const isFirstTimeSync =
    !!session &&
    !hasCompletedLibrarySync(syncStatus) &&
    (syncStatus == null ||
      syncStatus.status === 'queued' ||
      syncStatus.status === 'syncing' ||
      syncStatus.status === 'failed');

  if (isFirstTimeSync) {
    return <InitialSyncingScreen />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
