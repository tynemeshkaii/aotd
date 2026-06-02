import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import type { Database } from '@/types/database';

import { env } from './env';

async function getLegacySecureStoreItem(key: string) {
  try {
    const value = await SecureStore.getItemAsync(key);
    if (!value) {
      return null;
    }

    await AsyncStorage.setItem(key, value);
    await SecureStore.deleteItemAsync(key).catch((error: unknown) => {
      if (__DEV__) {
        console.warn('[auth] Could not delete legacy SecureStore session:', error);
      }
    });
    return value;
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] Could not migrate legacy SecureStore session:', error);
    }
    return null;
  }
}

const SupabaseStorageAdapter = {
  getItem: async (key: string) =>
    (await AsyncStorage.getItem(key)) ?? getLegacySecureStoreItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: async (key: string) => {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key).catch((error: unknown) => {
      if (__DEV__) {
        console.warn('[auth] Could not remove legacy SecureStore session:', error);
      }
    });
  },
};

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: SupabaseStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

if (AppState.currentState === 'active') {
  supabase.auth.startAutoRefresh();
}

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
