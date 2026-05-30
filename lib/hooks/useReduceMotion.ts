import { useSyncExternalStore } from 'react';

import { getReduceMotion, subscribeReduceMotion } from '@/lib/motion';

/**
 * Returns true when the OS "Reduce Motion" accessibility setting is on.
 * Gate parallax, entrance animations, and skeleton shimmer behind this so the
 * app stays fully usable (and not nauseating) for motion-sensitive users.
 */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribeReduceMotion, getReduceMotion, getReduceMotion);
}
