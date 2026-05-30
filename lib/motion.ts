import { AccessibilityInfo } from 'react-native';

// Shared "reduce motion" state. We read the OS accessibility setting once and
// keep it live via the change listener. Both the React hook (useReduceMotion)
// and the imperative haptics helper read from here so motion + haptics are
// suppressed together when the user has Reduce Motion turned on.

let enabled = false;
const listeners = new Set<() => void>();

function setEnabled(next: boolean) {
  if (next === enabled) return;
  enabled = next;
  for (const listener of listeners) listener();
}

// Kick off the initial read + subscribe to OS changes. Best-effort: any failure
// just leaves motion enabled (the safe visual default).
AccessibilityInfo.isReduceMotionEnabled()
  .then(setEnabled)
  .catch(() => {
    /* ignore — default to motion enabled */
  });

AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);

export function getReduceMotion(): boolean {
  return enabled;
}

export function subscribeReduceMotion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
