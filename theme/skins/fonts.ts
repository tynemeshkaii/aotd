import { Archivo_600SemiBold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { useFonts } from 'expo-font';

export const skinFonts = {
  Archivo_600SemiBold,
  Archivo_800ExtraBold,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  SpaceMono_400Regular,
  SpaceMono_700Bold,
};

export function useSkinFonts() {
  return useFonts(skinFonts);
}
