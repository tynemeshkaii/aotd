import { editorialSkin } from '@/components/skins/editorial';
import type { SkinComponentSet, SkinId } from '@/theme/skins/types';

export const skinRegistry: Record<SkinId, SkinComponentSet> = {
  editorial: editorialSkin,
};

export function useSkinComponents(): SkinComponentSet {
  return skinRegistry.editorial;
}
