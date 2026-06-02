import { useFocusEffect } from 'expo-router';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/lib/hooks/useReduceMotion';

type AccentFlowContextValue = {
  progress: SharedValue<number>;
  reduceMotion: boolean;
  setScreenActive: (active: boolean) => void;
};

const AccentFlowContext = createContext<AccentFlowContextValue | null>(null);

export function AccentFlowProvider({ children }: { children: ReactNode }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReduceMotion();
  const [screenActive, setScreenActive] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      setAppActive(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const enabled = screenActive && appActive && !reduceMotion;
    if (!enabled) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1);

    return () => cancelAnimation(progress);
  }, [appActive, progress, reduceMotion, screenActive]);

  const value = useMemo(
    () => ({ progress, reduceMotion, setScreenActive }),
    [progress, reduceMotion],
  );

  return <AccentFlowContext.Provider value={value}>{children}</AccentFlowContext.Provider>;
}

export function useAccentFlow() {
  const value = useContext(AccentFlowContext);
  if (!value) {
    throw new Error('useAccentFlow must be used inside AccentFlowProvider');
  }
  return value;
}

export function useAccentFlowFocus(active = true) {
  const { setScreenActive } = useAccentFlow();

  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;

      setScreenActive(true);
      return () => setScreenActive(false);
    }, [active, setScreenActive]),
  );
}
