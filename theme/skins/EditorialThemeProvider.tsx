import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { dayPalette, nightPalette, type Palette } from '@/components/skins/shared/skinStyles';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';

const STORAGE_KEY = 'editorial-edition';

export type Edition = 'day' | 'night' | 'system';

type EditorialThemeContextValue = {
  edition: Edition;
  palette: Palette;
  setEdition: (edition: Edition) => void;
};

const EditorialThemeContext = createContext<EditorialThemeContextValue | null>(null);

function resolvePalette(edition: Edition, colorScheme: 'light' | 'dark' | null): Palette {
  if (edition === 'night') return nightPalette;
  if (edition === 'day') return dayPalette;
  return colorScheme === 'dark' ? nightPalette : dayPalette;
}

export function EditorialThemeProvider({
  children,
  forcedEdition,
}: {
  children: ReactNode;
  forcedEdition?: Edition;
}) {
  const colorScheme = useColorScheme();
  const [edition, setEditionState] = useState<Edition>(forcedEdition ?? 'day');
  const [hydrated, setHydrated] = useState(!!forcedEdition);

  useEffect(() => {
    if (forcedEdition) return undefined;

    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        const initial: Edition =
          stored === 'day' || stored === 'night' || stored === 'system' ? stored : 'system';
        setEditionState(initial);
        setHydrated(true);
      })
      .catch(() => {
        if (!active) return;
        setEditionState('system');
        setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [forcedEdition]);

  const setEdition = useCallback(
    async (next: Edition) => {
      if (forcedEdition) return;
      setEditionState(next);
      try {
        await AsyncStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Persistence is best-effort; the in-memory choice still applies.
      }
    },
    [forcedEdition],
  );

  const activeEdition = forcedEdition ?? edition;
  const palette = useMemo(
    () => resolvePalette(activeEdition, colorScheme ?? null),
    [activeEdition, colorScheme],
  );

  const value = useMemo(
    () => ({ edition: hydrated ? activeEdition : 'day', palette, setEdition }),
    [activeEdition, hydrated, palette, setEdition],
  );

  return (
    <EditorialThemeContext.Provider value={value}>
      <EditionTransition>{children}</EditionTransition>
    </EditorialThemeContext.Provider>
  );
}

function EditionTransition({ children }: { children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const { edition } = useEdition();
  const opacity = useSharedValue(1);
  const isFirst = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: edition intentionally triggers the crossfade
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (reduceMotion) return;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 160 });
  }, [edition, opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (reduceMotion) return children;
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

export function useEditorialPalette(): Palette {
  const value = useContext(EditorialThemeContext);
  if (!value) {
    throw new Error('useEditorialPalette must be used inside EditorialThemeProvider');
  }
  return value.palette;
}

/** Non-throwing variant for generic UI primitives that may render outside the editorial tree. */
export function useOptionalEditorialPalette(): Palette | null {
  const value = useContext(EditorialThemeContext);
  return value?.palette ?? null;
}

export function useEdition(): Pick<EditorialThemeContextValue, 'edition' | 'setEdition'> {
  const value = useContext(EditorialThemeContext);
  if (!value) {
    throw new Error('useEdition must be used inside EditorialThemeProvider');
  }
  return { edition: value.edition, setEdition: value.setEdition };
}
