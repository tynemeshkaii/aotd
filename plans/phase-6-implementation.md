# Phase 6 — Implementation Summary

> Technical record of what shipped for Phase 6 (Design System + Rich Profile + Polish). Companion to the scope plan `plans/phase-6-design-system-profile-polish.md` (read that for rationale; this doc is the as-built reference).

**Status:** implemented + verified (`tsc --noEmit` clean, `biome check` clean). Profile migration applied to the live DB (`supabase db push`) and `types/database.ts` regenerated (`npm run db:types`).
**Date:** 2026-05-30
**Visual direction:** B — rich / "album-y" (color bleeds from cover, parallax, glass, visible motion).

---

## 1. Dependencies added

All Expo-Go-safe on SDK 54.

| Package | Version | Use |
|---|---|---|
| `expo-haptics` | ~15.0.8 | Tactile feedback (rating select, open, share) |
| `expo-image` | ~3.0.11 | Cover loading + cache + `blurRadius` backdrop |
| `expo-linear-gradient` | ~15.0.8 | Gradient scrims over the cover backdrop |
| `expo-blur` | ~15.0.8 | Glass surfaces (`Card` glass, "Why this album") |
| `moti` | ^0.30.0 | Declarative entrance + skeleton animations (rides on Reanimated) |

Install: `npx expo install expo-haptics expo-image expo-linear-gradient expo-blur` then `npm install moti --legacy-peer-deps`. `babel-preset-expo` auto-applies the `react-native-worklets` plugin (worklets already installed), so moti/Reanimated worklets transform with no babel config change.

`react-native-image-colors` deliberately **not** used — native module, won't load in Expo Go. "Color from cover" is a blurred enlarged copy of the art instead.

---

## 2. Design tokens

`theme/colors.js` swapped to the brand palette (single source of truth; `tailwind.config.js` + `theme/colors.d.ts` consume it). No hardcoded hex anywhere in `app/`/`components/`/`lib/`.

| Token | Hex | Role |
|---|---|---|
| `bg` | `#120a0c` | deep wine-black base |
| `surface` | `#1d1014` | raised surface |
| `surface-2` | `#2a181d` | higher surface / borders |
| `text` | `#f4ebe0` | cream primary text |
| `muted` | `#9c8b86` | warm taupe secondary |
| `accent` | `#d9a441` | gold — highlights, active tab, selected states, eyebrows |
| `primary` | `#87263b` | burgundy — main CTAs |
| `on-primary` | `#f4ebe0` | cream text on burgundy |
| `spotify` | `#1db954` | Spotify-branded sign-in button **only** |
| `rate-loved/liked/alright/notforme/bad` | gold→red ramp | per-level rating tints (subtle dots, not primary visual) |

Typography (`components/ui/Text.tsx`): added `title` (hero album title, 3xl), `h3`, `label` (gold uppercase eyebrow), `subtle`; `h1` rescaled to 2xl.

---

## 3. Shared primitives (`components/ui/`, `lib/`)

| File | What |
|---|---|
| `lib/motion.ts` | Live OS reduce-motion flag: `getReduceMotion()` + `subscribeReduceMotion()`, seeded from `AccessibilityInfo` + change listener |
| `lib/hooks/useReduceMotion.ts` | `useSyncExternalStore` wrapper over `lib/motion.ts` |
| `lib/haptics.ts` | Named intents `selection`/`impactLight`/`impactMedium`/`success`/`warning`. try/catch wrapped, no-op when reduce-motion on |
| `components/ui/CoverImage.tsx` | `expo-image` wrapper (memory-disk cache, transition, blurhash placeholder). Registers `cssInterop(Image, { className: 'style' })` |
| `components/ui/Card.tsx` | `surface` card or `glass` (BlurView as `StyleSheet.absoluteFill` behind a padded content view — never `className` padding on BlurView) |
| `components/ui/Skeleton.tsx` | moti opacity pulse, reduce-motion aware (static dim block when on). Registers `cssInterop(MotiView, …)` |
| `components/ui/EmptyState.tsx` | Centered icon + title + subtitle + optional action |
| `components/ui/ErrorState.tsx` | Retryable error (title/body/retry + optional secondary). Used so RPC failures never silent-empty |
| `components/ui/Button.tsx` | Variants `primary`(burgundy)/`accent`(gold)/`secondary`/`ghost`/`glass`; inline `loading` spinner; press haptic (`haptic={false}` opt-out); keeps `title` prop |

---

## 4. Rich daily-pick surface

`AlbumDetail.tsx` rewritten as a **self-contained, full-bleed** parallax surface — no longer wrapped in `Screen`.

- `Animated.ScrollView` (Reanimated) + `useAnimatedScrollHandler` → `scrollY` shared value; `useSafeAreaInsets` for top inset.
- `components/album/CoverBackdrop.tsx` — enlarged blurred cover (`expo-image` `blurRadius={60}`) + `expo-linear-gradient` scrim fading to `bg`; parallaxes up on scroll, stretches on overscroll; static burgundy→bg gradient fallback when no cover. Gated by reduce-motion.
- `AlbumHero.tsx` — cover with overscroll zoom; **two-layer shadow** (outer shadow+`elevation`, inner `overflow-hidden` clip) because iOS clips a view's own shadow.
- `WhyThisAlbum.tsx` — glass `Card` + gold `label` eyebrow; same `formatSelectionReason` output.
- `AlbumActions.tsx` — burgundy "Open in Spotify" `primary` CTA + glass share button; haptics on both.
- `RatingEditor.tsx` — `haptics.selection()` on pick, `haptics.success()`/`warning()` on save; per-level tint dot; moti checkmark fade-in on selected. Microcopy contract preserved (one-time journal alert still in `useSaveRating.onSuccess`).
- Share path unchanged — `ShareCard` stays on RN `Image` (not `expo-image`) for reliable `react-native-view-shot` capture.

Consumers:
- `app/(tabs)/index.tsx` (Home): renders `<AlbumDetail isToday footer={nudge}/>` on success; `AlbumDetailSkeleton` while loading; `PickError` (retryable) on error; `WaitingForPick` on successful no-row. Error never masked as waiting.
- `app/discoveries/[aotdId].tsx`: `<AlbumDetail header={<BackButton/>}/>` on success; skeleton / `ErrorState` (retry+back) / `EmptyState` (not-found) otherwise.

`PickError` → `ErrorState`, `WaitingForPick` → `EmptyState` (semantics unchanged).

---

## 5. Discoveries polish

- `app/(tabs)/discoveries.tsx`: skeleton rows on first load, `ErrorState` on error, `EmptyState` for empty. `Unrated` middle-filter label kept.
- `components/album/DiscoveryListItem.tsx`: `CoverImage` thumbnail, semantic status dot (`statusTint` maps rating/status → token), staggered moti entrance.
- **Recycle guard:** entrance animates once per `aotd_id` via a module-level `Set` — FlatList remounts rows on scroll and realtime refetch would otherwise replay the fade. Reuse this pattern for any list entrance motion.

---

## 6. Rich Profile

`app/(tabs)/profile.tsx` rebuilt with per-section skeletons. Sections: hero (avatar + name + streak line), `TasteSection`, `ListeningSummary`, library status (+ `SyncBanner`, Profile-only), connections (+ Free/Premium badge), settings (push time placeholder → Phase 7, sign out).

### RPC — `get_profile_overview`

Migration `supabase/migrations/20260530000000_phase6_profile_overview.sql`. `security definer`, `set search_path = public`, ownership guard (`p_user_id <> auth.uid()` → 42501). Grants: `revoke all from public, anon, authenticated; grant execute to authenticated`. In `types/database.ts` as `{ Args: { p_user_id }; Returns: Json }`.

Returns jsonb:
```
{ streak, total_discovered,
  taste: { top_artists:[{name,count}], decades:[{decade,count}], span_min, span_max },
  listening: { rated_this_month, loved_count, avg_score, total_rated } }
```

- Aggregates base tables server-side (library can be 10k+ rows). Reads `user_library`/`albums_of_the_day`/`ratings` directly (SECURITY DEFINER bypasses RLS; ownership already validated) — does not rely on `user_library_active`'s `auth.uid()` filter.
- Top artists exclude pseudo-artists (`various artists`/`various`/`va`/`unknown`/`unknown artist`).
- **Streak** = consecutive local-tz days (`safe_profile_timezone`) where pick `status in ('opened','rated')`, via gap-and-islands on the `date` column. Grace: counts the run ending at today **or** yesterday, so an un-opened today (e.g. 8am) doesn't reset a streak earned through yesterday; if neither today nor yesterday qualifies → 0.

### Hook — `lib/hooks/useProfileOverview.ts`

`useQuery(['profile-overview', userId])` calling `supabase.rpc('get_profile_overview', { p_user_id })` inline (typed; `as never` cast removed after `db:types`). Returns typed `ProfileOverview`. `ListeningSummary` coerces `avg_score` with `Number(...)` before `.toFixed(1)` (Postgres `numeric` safety).

### Components

`components/profile/TasteSection.tsx` (artist chips + decade bars + span line), `components/profile/ListeningSummary.tsx` (3 stats + deep-link to filtered `rated` Discoveries). Recurring tone strings in `lib/copy.ts`.

---

## 7. Accessibility & motion

- Reduce-motion gates parallax, list entrance, skeleton shimmer; haptics no-op when on.
- Touch targets ≥44pt (`min-h-12` buttons, `min-h-12` rating pills).
- Tab bar active tint is gold automatically (token-driven; glass tab bar deferred — open question).
- First-load spinners → skeletons everywhere except `SpotifyButton` (inline busy) and `InitialSyncingScreen` (indeterminate connect step), which keep `ActivityIndicator`.

---

## 8. Bugs found + fixed during audit

1. **FlatList entrance replay** — `DiscoveryListItem` fade re-fired on scroll recycle / realtime refetch. Fixed with per-`aotd_id` session `Set`.
2. **iOS shadow clipped** — `AlbumHero` cover had shadow + `overflow-hidden` on one node; iOS clips a view's own shadow. Split into outer shadow / inner clip layers.
3. **`avg_score` coercion** — `Number(...)` before `.toFixed(1)` in `ListeningSummary` for `numeric`-as-string safety.

---

## 9. Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` (`biome check`) — clean (121 files).
- Migration applied to live DB; `get_profile_overview` present in regenerated `types/database.ts`; `authenticated`-only grants.

---

## 10. Remaining (Phase 6 tail / deferred)

- Final **app icon + splash** assets (design task; needs native rebuild to see icon, splash shows in Expo Go). Wiring already in `app.config.ts` — just swap PNGs in `assets/`.
- **On-device QA** in Expo Go — parallax/blur/haptics/moti-on-Reanimated-4 must be felt on a real iPhone.
- Glass tab bar (optional), decade-distribution visual refinement — see plan §17.

Deferred to Phase 7 (out of scope): Sentry, analytics, push notifications, onboarding, GDPR/delete-account, Spotify Extended Quota.

---

## 11. File inventory

**New:** `components/album/CoverBackdrop.tsx`, `components/album/AlbumDetailSkeleton.tsx`, `components/ui/{Card,CoverImage,Skeleton,EmptyState,ErrorState}.tsx`, `components/profile/{TasteSection,ListeningSummary}.tsx`, `lib/motion.ts`, `lib/haptics.ts`, `lib/copy.ts`, `lib/hooks/{useReduceMotion,useProfileOverview}.ts`, `supabase/migrations/20260530000000_phase6_profile_overview.sql`.

**Modified:** `theme/colors.{js,d.ts}`, `tailwind.config.js` (no change — consumes tokens), `components/ui/{Text,Button}.tsx`, `components/album/{AlbumDetail,AlbumHero,WhyThisAlbum,AlbumActions,RatingEditor,DiscoveryListItem}.tsx`, `components/auth/SpotifyButton.tsx`, `components/home/{PickError,WaitingForPick}.tsx`, `app/(tabs)/{index,profile,discoveries}.tsx`, `app/discoveries/[aotdId].tsx`, `package.json`, `.gitignore`.
