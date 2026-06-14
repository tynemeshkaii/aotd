import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { dayPalette, nightPalette, type Palette } from '@/components/skins/shared/skinStyles';

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

export function EditorialThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const [edition, setEditionState] = useState<Edition>('day'); // render day until hydrated
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
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
  }, []);

  const setEdition = useCallback(async (next: Edition) => {
    setEditionState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the in-memory choice still applies.
    }
  }, []);

  const palette = useMemo(
    () => resolvePalette(edition, colorScheme ?? null),
    [edition, colorScheme],
  );

  const value = useMemo(
    () => ({ edition: hydrated ? edition : 'day', palette, setEdition }),
    [edition, hydrated, palette, setEdition],
  );

  return <EditorialThemeContext.Provider value={value}>{children}</EditorialThemeContext.Provider>;
}

export function useEditorialPalette(): Palette {
  const value = useContext(EditorialThemeContext);
  if (!value) {
    throw new Error('useEditorialPalette must be used inside EditorialThemeProvider');
  }
  return value.palette;
}

export function useEdition(): Pick<EditorialThemeContextValue, 'edition' | 'setEdition'> {
  const value = useContext(EditorialThemeContext);
  if (!value) {
    throw new Error('useEdition must be used inside EditorialThemeProvider');
  }
  return { edition: value.edition, setEdition: value.setEdition };
}
