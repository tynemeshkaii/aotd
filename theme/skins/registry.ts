import { useEditorialSkin } from '@/components/skins/editorial';
import type { SkinComponentSet } from '@/theme/skins/types';

export function useSkinComponents(): SkinComponentSet {
  return useEditorialSkin();
}
