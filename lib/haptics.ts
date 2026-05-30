import * as Haptics from 'expo-haptics';

import { getReduceMotion } from '@/lib/motion';

// Named haptic intents so call sites read well and we can globally suppress
// feedback. Every call is best-effort: haptics must never throw into a user
// action, and they no-op when Reduce Motion is enabled.

function safe(run: () => Promise<void>): void {
  if (getReduceMotion()) return;
  run().catch(() => {
    /* ignore — haptics are a non-critical side effect */
  });
}

export const haptics = {
  /** Light tick for discrete selections (e.g. choosing a rating level). */
  selection(): void {
    safe(() => Haptics.selectionAsync());
  },
  /** Light impact for primary taps (open, share launch). */
  impactLight(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Medium impact for more consequential taps. */
  impactMedium(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** Success notification (e.g. rating saved). */
  success(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** Warning notification (e.g. recoverable error). */
  warning(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
};
