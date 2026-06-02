# Expo runtime warning remediation plan

Date: 2026-06-02

## Decision

Keep the three warnings in one remediation plan because they share the same release-quality goal: Expo Go should run without noisy runtime warnings that hide real problems. Implement them as three independent tracks, in this order:

1. Supabase auth storage warning (`SecureStore` value > 2048 bytes).
2. Skin registry require cycle.
3. `SafeAreaView` deprecation warning sweep.

The tracks should stay separately reviewable in code. Track 1 changes auth persistence and is the only behavior-sensitive fix. Tracks 2 and 3 are structural cleanup.

## Current warnings

### 1. `SecureStore` value larger than 2048 bytes

Warning:

```text
Value being stored in SecureStore is larger than 2048 bytes and it may not be stored successfully.
In a future SDK version, this call may throw an error.
```

Current source:

- `lib/supabase.ts` uses `expo-secure-store` as the storage adapter for `@supabase/supabase-js`.
- Supabase persists the complete auth session under this adapter when `persistSession: true`.
- The complete session can include access token, refresh token, user payload, app metadata, and user metadata, which can exceed SecureStore's practical size limit.
- The one-time flags in `useSaveRating` and `useSpotifyFreeExplainer` store only `'1'`; they are not the likely source.

Risk:

- Session persistence may silently fail after app restart.
- Users may get unexpectedly signed out.
- Future Expo SDKs may turn the warning into a thrown write error.

Recommended fix:

- Move Supabase auth session persistence from `expo-secure-store` to `@react-native-async-storage/async-storage`.
- Keep SecureStore only for tiny best-effort flags if needed.
- Add `@react-native-async-storage/async-storage` through Expo-compatible installation.
- Update `lib/supabase.ts` to use the AsyncStorage adapter:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const SupabaseStorageAdapter = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
```

Implementation details:

- Preserve `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`, and `flowType: 'pkce'`.
- Do not change Spotify token storage in Supabase. Provider access/refresh tokens still belong in the server-side `streaming_connections` table, not in app storage.
- Leave rating microcopy and Spotify Free explainer SecureStore flags unchanged unless they start warning; they store tiny values and already catch storage errors.
- Update `AGENTS.md`, because it currently says Supabase Auth in React Native uses SecureStore.

Validation:

- Run `npm run typecheck`.
- Run `npm run lint`.
- Start Expo, sign out/sign in, fully kill the app, reopen it, and confirm the user remains signed in.
- Confirm the `SecureStore` > 2048 bytes warning no longer appears during sign-in/session restore.

User command needed:

```bash
npx expo install @react-native-async-storage/async-storage
```

If peer dependency resolution fails, use the repo rule:

```bash
npm install --legacy-peer-deps
```

Do not use plain `npm install`.

## 2. Skin registry require cycle

Warning:

```text
Require cycle: theme/skins/registry.ts -> components/skins/editorial/index.tsx -> components/ui/ProgressBar.tsx -> theme/skins/registry.ts
```

Current source:

- `theme/skins/registry.ts` imports `editorialSkin`.
- `components/skins/editorial/index.tsx` imports `components/ui/ProgressBar`.
- `components/ui/ProgressBar.tsx` imports `useSkinComponents` from `theme/skins/registry.ts`.

Risk:

- Require cycles are allowed but can produce partially initialized values.
- Hot reload/startup behavior may become flaky as the skin system grows.

Recommended fix:

- Make `ProgressBar` presentational and remove its dependency on `useSkinComponents`.
- Pass explicit colors or a compact variant from callers.

Preferred implementation:

```ts
type ProgressBarProps = {
  ratio: number;
  className?: string;
  trackColor?: string;
  fillColor?: string;
  borderColor?: string;
  height?: number;
  bordered?: boolean;
};
```

- Default `ProgressBar` values can still use the static global palette from `theme/colors`, because `theme/colors.js` does not import the skin registry.
- Editorial skin should pass `editorialColors.paper`, `editorialColors.accent`, and `editorialColors.ink` explicitly.
- Shared legacy callers such as `components/library/SyncBanner.tsx` can use defaults.

Validation:

- Run `npm run typecheck`.
- Run `npm run lint`.
- Start Expo and confirm the require-cycle warning disappears.
- Verify Initial Syncing and Profile progress bars still render correctly.

## 3. `SafeAreaView` deprecation warning sweep

Warning:

```text
SafeAreaView has been deprecated and will be removed in a future release.
Please use 'react-native-safe-area-context' instead.
```

Current source assessment:

- Current app imports `SafeAreaView` from `react-native-safe-area-context`, not from `react-native`.
- Local code references are:
  - `components/ui/Screen.tsx`
  - `app/(tabs)/index.tsx`
  - `app/auth/callback.tsx`
  - `app/+not-found.tsx`
- Because the imports are already from `react-native-safe-area-context`, this warning may come from a dependency or from React Native's internal deprecation logging.

Risk:

- Low for current behavior.
- Medium for warning hygiene, because it can hide more important warnings in Expo logs.

Recommended fix:

- Replace remaining `SafeAreaView` component usage in app code with `View + useSafeAreaInsets`.
- Keep `SafeAreaProvider` in `app/_layout.tsx`.
- Create a small local helper only if duplication grows; otherwise keep each screen simple.

Target pattern:

```tsx
const insets = useSafeAreaInsets();

return (
  <View style={{ paddingTop: insets.top, backgroundColor: chrome.rootBackground }}>
    ...
  </View>
);
```

Implementation details:

- `components/ui/Screen.tsx` should become the main safe-area abstraction for ordinary screens.
- `app/(tabs)/index.tsx` can either use `Screen` or use direct `View + insets` if it needs custom Home behavior.
- `app/auth/callback.tsx` and `app/+not-found.tsx` should be converted directly.
- Do not remove `react-native-safe-area-context`; it remains the correct provider and hook source.

Validation:

- Run `npm run typecheck`.
- Run `npm run lint`.
- Start Expo and confirm the warning no longer appears from app code.
- Check Home, Discoveries, auth callback, and not-found screens on iPhone dimensions for top/bottom spacing regressions.

## Implementation order

1. Install `@react-native-async-storage/async-storage` through `npx expo install`.
2. Replace Supabase auth session storage adapter in `lib/supabase.ts`.
3. Update `AGENTS.md` auth-storage instruction.
4. Refactor `ProgressBar` so it does not import the skin registry.
5. Update editorial progress-bar call sites to pass explicit colors.
6. Convert remaining app `SafeAreaView` usages to `View + useSafeAreaInsets`.
7. Run typecheck/lint.
8. Run Expo Go smoke test:
   - fresh sign-in,
   - app kill/reopen session restore,
   - Home layout,
   - Discoveries layout,
   - Initial Syncing/Profile progress bars,
   - terminal warning check.

## Acceptance criteria

- No `SecureStore` > 2048 bytes warning during sign-in or session restore.
- No skin registry require-cycle warning.
- No app-owned `SafeAreaView` deprecation warning.
- Auth session survives full app restart.
- No visual regression in Home, Discoveries, Sign-in, Initial Syncing, Profile, or Not Found.
- `npm run typecheck` passes.
- `npm run lint` passes.

## Notes

- Track 1 is the only track that needs a dependency install.
- Track 2 should not change any visible design.
- Track 3 may slightly change top/bottom spacing, so it needs visual checking on a real device.
