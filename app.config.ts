import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Album of the Day',
  slug: 'album-of-the-day',
  scheme: 'albumoftheday',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.pesnya.albumoftheday',
    supportsTablet: false,
    infoPlist: {
      LSApplicationQueriesSchemes: ['spotify'],
    },
  },
  android: {
    package: 'com.pesnya.albumoftheday',
    adaptiveIcon: {
      backgroundColor: '#0a0a0a',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0a0a0a',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    spotifyClientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    env: process.env.EXPO_PUBLIC_ENV ?? 'development',
  },
};

export default config;
