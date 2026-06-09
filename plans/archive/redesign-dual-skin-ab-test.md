# Redesign — Dual-Skin Device Bakeoff (Editorial vs Generative)

> **Status:** Planned (not started). This is a client-only, presentation-layer redesign experiment.
> **Goal:** Build two complete, switchable visual languages ("skins") for the existing app so the
> winner can be chosen by testing both on a real device, then drop the loser.
> **Backend:** Zero changes. No migrations, no Edge Function changes, no RPC changes.
>
> **Important naming note:** this is an A/B-style *manual design bakeoff*, not a statistical A/B test.
> There is no randomized assignment, analytics instrumentation, cohort tracking, or server-side flagging.
> The purpose is to compare two visual directions on the same real product flows and pick one deliberately.

---

## Resolved Decisions (Locked)

1. **Two skins:** `editorial` (A — Swiss/print poster) and `generative` (C — cover-derived abstract field,
   glass, subtle motion).
2. **Purpose:** Temporary design tool. Build both, test on device, choose one, delete the loser. Persistence
   and infra stay minimal. The removal path must be explicit and cheap.
3. **Architecture:** Shared controllers + duplicated presentation views. Data fetching, mutations, navigation
   decisions, share/open/rating orchestration, and error-state decisions stay shared. Skin views receive props
   and callbacks; they do not reimplement product behavior.
4. **Scope of v1:** Home, discovery detail, Discoveries, Profile, sign-in, first-time sync/onboarding, share
   card, sync banner, rating editor, skin toggle, tab/status/root chrome, and all loading/error/empty/waiting
   states.
5. **Runtime:** Expo Go (SDK 54) now. Generative motion uses blurred-cover imagery + `expo-linear-gradient` +
   Reanimated/Moti only — **no Skia, no pixel color extraction** (per `CLAUDE.md`). A dev build with
   `@shopify/react-native-skia` for a true gradient mesh is a later upgrade, only if `generative` wins.
6. **Decision criteria:** vibe is the main subjective decision input, but readability/contrast, performance,
   functional parity, accessibility, and diverse-cover behavior are hard gates. A skin that fails a hard gate
   cannot win until fixed.
7. **Skin persistence:** `expo-secure-store` (already a dependency). Key `active_skin`
   (SecureStore key chars: alphanumeric + `.` `-` `_` only, no `:`). Default skin: `editorial`.
8. **Toggle:** A segmented control in Profile → settings. No separate shipped dev panel.
9. **Test harness:** Use a temporary fixture gallery/component during implementation so bright covers, missing
   artwork, long titles, long artist names, and long reasons are testable without waiting for live data.

---

## Design DNA Shared by Both Skins

Both skins render the same content and information hierarchy; they diverge in type, surface, list style,
rating treatment, share-card composition, and motion. Shared visual ideas:

- Content framed as a daily "issue": today's pick = the cover story, streak/day count = issue number
  (`No. 142`), Discoveries = the archive/contents, Profile = the colophon/masthead.
- Cover art is the anchor of every album screen. Abstract decoration must be derived from, frame, or respond
  to the album art rather than feeling like generic ornament.
- 5-level rating shown as a tactile mark (a printed stamp in editorial, a luminous pill/mark in generative),
  never stars/sliders. Same `useSaveRating` logic underneath.
- Brand tone (humorous, low-pressure) preserved in all copy. Reuse `lib/copy.ts` and existing copy helpers;
  do not introduce localization or Russian strings in v1.
- Spotify-branded UI remains Spotify green only where required (`SpotifyButton`, Spotify-specific badge).

---

## Architecture

### Skin Core — `theme/skins/`

- `types.ts`
  - `export type SkinId = 'editorial' | 'generative'`.
  - `SkinChrome` for root background, status bar style, tab bar colors, icon tint, and shared spacing knobs.
  - `SkinComponentSet` for the renderable view contracts listed below.
- `SkinProvider.tsx`
  - Reads `active_skin` from SecureStore on mount.
  - Exposes `{ skin, setSkin }`.
  - `setSkin` persists best-effort only; SecureStore failure logs and does not crash or block UI.
  - Render-gated: do not render children until the stored value has been read once, to avoid a skin flash.
  - Mounted high in `app/_layout.tsx`, above `RouterGuard`.
- `useSkin.ts`
  - `export function useSkin(): { skin: SkinId; setSkin(id: SkinId): void }`.
- `registry.ts`
  - `skinRegistry: Record<SkinId, SkinComponentSet>`.
  - `useSkinComponents()` returns the active component set and chrome tokens.
  - Routers/controllers read the registry instead of scattering ternary branches throughout the app.

### Fonts — `theme/skins/fonts.ts` (+ `expo-font`)

- **New deps (manual install):**
  `PATH=/opt/homebrew/bin:$PATH NPM_CONFIG_LEGACY_PEER_DEPS=true npx expo install expo-font @expo-google-fonts/oswald @expo-google-fonts/space-mono`
  (`@expo-google-fonts/*` are JS-only and Expo-Go safe.) `expo install` still invokes npm under the hood,
  so keep `NPM_CONFIG_LEGACY_PEER_DEPS=true` to respect this repo's dependency rule. Then run
  `PATH=/opt/homebrew/bin:$PATH npx expo install --check`.
- **Editorial fonts:** a real condensed display face — `Oswald` (700) for masthead/display, plus
  `SpaceMono` (400/700) for kicker labels, spec lines, issue numbers, and archive metadata.
  **Do not fake condensed with `transform: scaleY`**; it breaks RN line metrics and vertical rhythm.
- **Generative fonts:** system sans (San Francisco / Roboto) at regular/medium weights for core readability,
  with system serif (Georgia) italic only for the "why this album" pull-quote. Avoid light body text over
  dynamic color fields.
- Load all required fonts once via `useFonts` in root layout; gate first render on load alongside the existing
  splash flow. Loading both skins' fonts up front is acceptable for this temporary bakeoff.

### Shared Controllers — No Behavior Duplication

The current app has important behavior inside presentation components (`AlbumDetail` owns share/open/free
explainer orchestration; Profile owns query/action logic; Sign-in owns OAuth bootstrap). For the bakeoff,
split that into shared controllers and skin views:

- `components/skins/shared/AlbumDetailController.tsx`
  - Owns `useReduceMotion`, scroll shared value, safe-area insets, `useOpenAlbum`, `useSpotifyFreeExplainer`,
    share-card capture, cover prefetch, and the off-screen `ShareCard` ref.
  - Passes `album`, metadata, motion values, `opening`, `sharing`, `onOpen`, `onShare`, `isFreeSpotify`,
    `header`, and `footer` to the active skin's `AlbumDetailView`.
  - Skin views must not call `useOpenAlbum`, `useSpotifyFreeExplainer`, `captureRef`, or `Share.share`
    directly.
- `components/skins/shared/DiscoveriesController.tsx`
  - Owns `useDiscoveries`, URL filter param handling, `All/Unrated/Rated` filtering, empty-state copy,
    retry behavior, and navigation to detail.
  - Passes ready-to-render state to the active `DiscoveriesView`.
- `components/skins/shared/ProfileController.tsx`
  - Owns profile/connection/overview/library queries, sync-now mutation, sign-out confirmation, product label,
    and skin toggle state.
  - Passes data, loading states, callbacks, and current skin to the active `ProfileView`.
- `components/skins/shared/SignInController.tsx`
  - Owns Spotify OAuth loading/error handling and `bootstrapSpotifySession`.
  - Passes `loading` and `onSignIn` to the active `SignInView`.
- `components/skins/shared/InitialSyncingController.tsx` or a shared adapter around the existing
  `InitialSyncingScreen`
  - First-time sync is a core first-run state and must be visually accounted for. Either skin it or explicitly
    verify that a shared version looks acceptable against both root backgrounds.

This keeps the bakeoff honest: the two skins compare visual language, not subtly different behavior.

### Presentation Sets — `components/skins/editorial/*` and `components/skins/generative/*`

Each set owns styling and exposes the same component contract. Per skin:

| Component | Replaces / wraps | Notes |
|---|---|---|
| `...AlbumDetailView.tsx` | `components/album/AlbumDetail.tsx` presentation | Home hero + history detail success state. Receives controller props only. |
| `...DiscoveriesView.tsx` | `app/(tabs)/discoveries.tsx` body + list rows + filter tabs | List, filter tabs, list item, list skeleton, empty/error states. |
| `...ProfileView.tsx` | `app/(tabs)/profile.tsx` body + `TasteSection` + `ListeningSummary` | Streak/colophon, taste, listening, connections, library, settings, skin toggle. |
| `...States.tsx` | `AlbumDetailSkeleton`, `PickError`, `WaitingForPick`, `EmptyState`, `ErrorState` | All non-success states, including retry actions. |
| `...ShareCard.tsx` | `components/album/ShareCard.tsx` | **Must keep RN `Image` (not `expo-image`)** for `react-native-view-shot` reliability. |
| `...SyncBanner.tsx` | `components/library/SyncBanner.tsx` | Profile/library state surface. |
| `...SignInView.tsx` | `app/(auth)/sign-in.tsx` body | Keep dedicated green `SpotifyButton` un-recolored. |
| `...InitialSyncingView.tsx` | `components/onboarding/InitialSyncingScreen.tsx` | First-run sync state; no blank/default-theme flash. |
| `...Backdrop.tsx` | `components/album/CoverBackdrop.tsx` | Editorial = paper/print field; Generative = cover-derived abstract field + scrims. |
| primitives | skin-local primitives | `EdText/EdButton/EdRule/EdPlate/EdStamp/EdSeal`; `GnText/GnGlass/GnPill/GnField/GnChip`. |

**Shared and unchanged:** `lib/hooks/*`, `lib/*`, Supabase client, auth/session semantics,
`components/auth/SpotifyButton.tsx`, RPC usage, rating semantics, Spotify-open behavior, and copy source.

### Screen Routers Stay Thin

`app/(tabs)/index.tsx`, `app/(tabs)/discoveries.tsx`, `app/(tabs)/profile.tsx`,
`app/discoveries/[aotdId].tsx`, `app/(auth)/sign-in.tsx`:

- Preserve routing semantics and deep-link paths.
- Render shared controllers, not skin-specific business logic.
- Controllers call `useSkinComponents()` and select the active view through the registry.
- Loading/error/waiting/not-found decisions remain centralized and identical across skins.

### Cross-Cutting Chrome That Must React to the Skin

- `app/(tabs)/_layout.tsx` — tab bar `tabBarStyle`, active/inactive tint, background, border/blur treatment,
  and icons switch by `SkinChrome`.
- **Status bar style** — `dark` on editorial cream, `light` on generative dark (`expo-status-bar` uses
  `dark`/`light`, not React Native's `dark-content`/`light-content` strings).
- **Root background** — editorial cream vs generative warm-black. Root loading states inside `RouterGuard`
  must also use skin chrome once `SkinProvider` is mounted.
- **RouterGuard first-run surface** — the `InitialSyncingScreen` branch in `app/_layout.tsx` must render
  through the active skin or an explicitly verified shared adapter.
- **Safe areas** — both skins must preserve top/bottom safe-area padding and keep touch targets away from
  the home indicator and screen edges.

---

## Visual Direction Review

### Editorial (A) — Swiss/Print Poster, Low Implementation Risk

**Core promise:** the app feels like a collectible daily music publication: a poster, archive, stamp, and
private listening journal in one.

- Use a strict asymmetric grid: large masthead, issue number, rules, captions, and deliberate whitespace.
- Let the album cover behave like a printed plate: square cover, cropped cover strip, or cover detail used as
  a registration block. The cover should stay inspectable, not be buried under effects.
- Use print texture sparingly: static paper grain, halftone dots, registration marks, crop ticks, overprint-like
  seals. Keep opacity low enough that it never competes with text.
- Rating treatment: stamped word marks (`Loved it`, `Liked it`, etc.) with tactile borders and ink variation,
  not icons, stars, sliders, or emoji.
- Discoveries should feel like a table of contents/archive: date, issue number, status stamp, cover thumbnail,
  strong row rhythm.
- Profile should feel like a masthead/colophon: identity, issue count/streak, listening stats, library source,
  and connection details treated as publication metadata.

**Strengths:** ink-on-cream contrast is naturally strong; the art comes from type, layout, and print language,
not dynamic cover color. Performance should be excellent: no live blur, minimal animation, low battery cost.

**Watch-outs:**

- Do not let all-caps labels become tiny or dense. Dynamic Type must not clip condensed Oswald.
- Use a true condensed font (`Oswald`), not transform scaling.
- Keep paper grain static: a small tiled PNG or low-opacity overlay around 3-5%.
- Cover "plate" borders can be sharp 2-2.5px, but avoid parent radius/anti-alias artifacts.
- Full cream background means status bar, tab bar, skeletons, and retry states must all flip to dark content.

### Generative (C) — Cover-Derived Abstract Field, Medium Risk

**Core promise:** each album temporarily dyes the app. The visual field feels generated from that record, not
from a fixed brand template.

- Build the field from the album cover itself: one enlarged blurred cover layer, one or two deterministic
  cropped/offset cover layers, and `expo-linear-gradient` scrims. Derive layer positions from stable album data
  (for example `album_spotify_id` hash) so the composition is stable across re-renders.
- Avoid generic decorative blobs/orbs as the main signature. If rounded shapes are used, they must read as
  softened cover fragments or veils, not random UI decoration.
- Use dark scrims behind every text cluster. Text should sit on intentional reading surfaces, not directly on
  unpredictable cover colors.
- Keep the actual cover art inspectable in the hero. Abstract fields support the cover; they do not replace it.
- Rating treatment: luminous tactile word pills/marks with enough contrast in all five states.
- Discoveries should feel like a living archive: rows inherit a small amount of cover color, but list text
  remains stable and scannable.
- Profile should be quieter than Home: a dark liquid masthead can exist, but stats/settings must stay readable
  and utilitarian.

**Color from cover without pixel extraction:** Expo-Go version uses blurred/cropped cover imagery and gradient
scrims. A true per-color gradient mesh needs Skia and is deferred to a dev build only if `generative` wins.
Document this so the Expo-Go version is treated as a credible prototype, not the final technical ceiling.

**Readability risk:** light type over dynamic art can fall below contrast. Mitigation is mandatory:

- Dark gradient scrim or glass/surface behind each text cluster.
- Regular/medium body weight; avoid 300-weight metadata over dynamic backgrounds.
- Bright/white and busy multicolor covers are required test fixtures.
- Body text must meet WCAG AA spot checks over worst-case fields; large display text may use 3:1 minimum only
  when it is truly display-sized and non-critical.

**Performance risk:** stacked blur, animated images, and glass can jank, especially on Android. Guardrails:

- Cap concurrent `BlurView`s to ideally one per screen; prefer pre-blurred `CoverImage` + gradient overlays.
- Avoid animating blur intensity, width/height, or layout properties. Animate transform/opacity only.
- Pause/freeze all motion when the screen is not focused (`useIsFocused`) and when Reduce Motion is enabled.
- Reduce Motion → static cover-derived field, no drift/parallax/list entrance.
- Keep motion subtle and slow; no attention-grabbing perpetual animation around reading text.
- On Android, keep `blurRadius` conservative and set `experimentalBlurMethod` when `BlurView` is used.

### Shared Soundness

- **Manual bakeoff only:** do not add analytics, remote config, or server-side flags for this phase.
- **No data divergence:** both skins consume identical controller props and callbacks.
- **No action duplication:** skins must not reimplement `save_album_rating`, status writes, share capture,
  Spotify Free explainer, OAuth bootstrap, or Spotify open logic.
- **Hydration flash:** gate first render on both SecureStore skin read and font load.
- **Mandatory product behavior:** Spotify Free badge + explainer, "Why this album" block, visible
  `Open in Spotify` button wording, first-time rating microcopy, share prefetch/capture, and retryable errors
  must exist in both skins.
- **Removal plan (loser):** remove the loser from `skinRegistry`, delete `components/skins/<loser>/`, remove
  unused fonts/primitives, remove the toggle if no longer needed, then either keep the winner behind the
  registry as a single skin or flatten it back into ordinary components.

---

## Build Sequence

Each step ends in a runnable, visibly testable state.

1. **Deps + skin core:** install fonts; add `theme/skins/{types,SkinProvider,useSkin,registry,fonts}.ts`;
   mount `SkinProvider` in `app/_layout.tsx`; gate render on skin read + fonts. Current UI still renders.
2. **Contracts + shared controllers:** introduce skin view contracts and shared controllers while routing to
   current/shared views first. Verify no behavior changes before visual duplication starts.
3. **Toggle + chrome:** add Profile segmented control; tab bar, status bar, root background, and RouterGuard
   loading states react to `skin`. Current screens still render.
4. **Fixture gallery/test harness:** add temporary fixtures for cover extremes, missing artwork, long titles,
   long artist names, long reasons, all rating states, and sync states. Keep it dev-only or remove before
   winner promotion.
5. **Editorial set:** build editorial views, states, share card, sync banner, sign-in, and initial sync. Wire
   via registry.
6. **Generative set:** build generative views, states, share card, sync banner, sign-in, and initial sync.
   Wire via registry.
7. **Polish + guardrails:** contrast scrims, Reduce Motion freeze, focus pause, BlurView cap, two-layer shadow
   pattern, Dynamic Type fixes, VoiceOver labels.
8. **Test pass:** run the full testing plan below; record scorecard and screenshots; choose winner.
9. **Winner cleanup:** delete loser and temporary fixture route/component, remove unused deps/fonts, and either
   keep the single winning skin architecture or flatten it.

---

## Testing Plan

### 0. Pre-Flight (Every Iteration)

- `PATH=/opt/homebrew/bin:$PATH npm run typecheck` — clean.
- `PATH=/opt/homebrew/bin:$PATH npm run lint` — clean (`global.css` excluded as usual).
- `PATH=/opt/homebrew/bin:$PATH npx expo install --check` — font/dep versions match SDK 54.
- `PATH=/opt/homebrew/bin:$PATH npx expo-doctor` — no native-module surprises for Expo Go.
- App boots in Expo Go on device with no red box; no skin/font/root-background flash on cold start.

### 1. Toggle + Persistence

- Switch Editorial <-> Generative from Profile — entire app re-skins instantly, no reload.
- Navigate across Home, Discoveries, detail, Profile, sign-in/first-run states after switching — no stale chrome.
- Kill and relaunch the app — last-selected skin is restored from SecureStore.
- Corrupt/empty SecureStore value → falls back to default `editorial`, no crash.
- SecureStore write failure simulation/logging path → UI switches in memory and does not show a false user error.

### 2. Functional Parity Matrix (Must Be Identical in Both Skins)

For each screen x state, confirm data, navigation, and actions behave the same; only looks differ.

| Screen / Flow | States to verify |
|---|---|
| Home (today's pick) | loading skeleton; waiting-for-pick; pick-read error with retry; success today; past-picks waiting footer |
| Album detail (history) | loading; not found; error with retry; success with prior rating; success without prior rating |
| Discoveries | loading; empty; error; All/Unrated/Rated filters; opened-but-unrated badge under Unrated |
| Profile | profile loading; overview loading; success; sync banner queued/syncing/failed/done; Free/Premium badge; sync now; sign out |
| Sign-in | idle; Spotify button busy state; OAuth error alert |
| First-time sync | queued; syncing/progress; failed/retry; completed handoff into tabs |
| Actions | Open in Spotify native + web fallback; Share PNG + text/url; rate all 5 levels; update rating; first-time rating microcopy; Free explainer alert before open |

- **Regression guard:** OAuth bootstrap, initial/bounded/full library sync, `save_album_rating` RPC,
  status transitions (`pending->opened->rated`, direct `pending->rated`), and `get_current_pick`
  error -> `PickError` (not masked as waiting) must all still work under each skin.

### 3. Fixture Gallery / Diverse-Cover Suite

Use fixed fixtures, not only live data, so every designer/developer sees the same cases:

- Dark/black cover.
- Bright/near-white cover.
- Highly saturated cover.
- Busy multicolor cover.
- Monochrome/minimal cover.
- Missing artwork.
- Very long album title.
- Very long artist name.
- Long "why this album" reason.
- All five rating values and unrated/opened states.

For each fixture: screenshot Home/detail hero, Discoveries row, share card, and rating editor in both skins.
Confirm no broken layout, unreadable text, clipped type, overlapping controls, or unintentional empty fields.

### 4. Vibe Evaluation

- Compare side by side on device via the toggle, using the same live pick and the fixture suite.
- Record one gut-reaction sentence per skin for Home, Discoveries, Profile, Sign-in, and Share Card.
- Treat vibe as the primary differentiator only after hard gates pass.

### 5. Readability / Contrast

- Editorial: confirm ink-on-cream, stamps, selected states, and tab bar colors are comfortable in sunlight and
  low brightness.
- Generative: on bright/white and busy covers, confirm title, artist, metadata, "why", CTA, rating labels,
  tab bar, and error text remain legible thanks to scrims/surfaces.
- Spot-check WCAG AA (4.5:1) for body text over worst-case generated fields. Capture notes/screenshots for
  any exception.

### 6. Edge Cases

- Large issue/streak numbers (`No. 1024`, 3-digit streak) do not overflow mastheads or profile stats.
- Dynamic long text wraps intentionally; no single long word can push content horizontally.
- Offline / RPC failure renders retryable error states, not silent empty states.
- Missing artwork still produces intentional editorial/generative art direction.
- Share card captures with cover loaded and without cover; no blank cover on slow networks.

### 7. Performance (Expo Go)

- Discoveries scroll: smooth, no dropped-frame stutter; FlatList row entrance animation fires once per
  `aotd_id` per session.
- Album detail parallax/overscroll: smooth, no jumpy layout shifts.
- Generative specific:
  - Open generative Home for 2-3 minutes and watch for device heat / battery drain.
  - Confirm motion pauses when screen is unfocused.
  - Confirm Reduce Motion freezes drift/parallax/list entrance.
  - Count active `BlurView`s (target <= 1/screen).
  - Compare perceived smoothness iOS vs Android if an Android device is available.
- Note any jank for the later dev-build/Skia decision; do not add Skia in this Expo Go phase.

### 8. Accessibility

- Reduce Motion ON -> generative becomes static; editorial remains stable.
- Dynamic Type / font scaling large -> text scales without clipping or overlap in both skins.
- VoiceOver labels:
  - Open, Share, retry, sign out, sync now.
  - Rating levels (`Loved it`, `Liked it`, `It was alright`, `Not for me`, `Bad`) with selected state.
  - Tabs and Discoveries list rows.
  - Skin segmented control.
- Touch targets stay at least 44pt high/wide with adequate spacing.
- Contrast verified in step 5.

### 9. Decision Scorecard

Score on device after the full test pass. Use 1-5 where 5 is best. Hard gates must be pass/fail.

| Criterion | Editorial | Generative | Notes |
|---|---:|---:|---|
| Overall vibe / "feels like my app" | | | |
| Home showpiece strength | | | |
| Discoveries scan quality | | | |
| Profile clarity | | | |
| Share-card desirability | | | |
| Readability / contrast hard gate | Pass/Fail | Pass/Fail | |
| Performance / smoothness hard gate | Pass/Fail | Pass/Fail | |
| Functional parity hard gate | Pass/Fail | Pass/Fail | |
| Accessibility hard gate | Pass/Fail | Pass/Fail | |
| Diverse covers + edge cases | | | |
| **Verdict** | | | |

Decision rule:

- If either skin fails a hard gate, fix it before choosing.
- If both pass, pick the stronger vibe/product identity, not the safer implementation by default.
- If generative wins but only feels partially realized because of Expo Go constraints, schedule the optional
  Skia dev-build upgrade as a follow-up, not as part of this bakeoff.

---

## Manual Steps Required

Run in this order and reasons:

1. `PATH=/opt/homebrew/bin:$PATH NPM_CONFIG_LEGACY_PEER_DEPS=true npx expo install expo-font @expo-google-fonts/oswald @expo-google-fonts/space-mono`
   — adds the font runtime + editorial faces, pinned to the SDK 54 matrix. `NPM_CONFIG_LEGACY_PEER_DEPS=true`
   matters because this repo's Expo/RN peer dependencies conflict under plain npm resolution.
2. `PATH=/opt/homebrew/bin:$PATH npx expo install --check`
   — verifies all `expo-*` packages remain on the SDK 54 matrix.
3. If any non-Expo dependency is added later:
   `PATH=/opt/homebrew/bin:$PATH npm install --legacy-peer-deps`
   — required by the repo's dependency rules.
4. `PATH=/opt/homebrew/bin:$PATH npx expo start -c`, then open in **Expo Go** on the device
   — `-c` clears Metro cache so newly bundled fonts and skin modules load cleanly.

No Supabase / migration / Edge Function steps — this redesign is client-only.
