# Phase 6 — Design System + Rich Profile + Polish

> Goal: turn a "functionally working" product into something that feels good to hold. We ship a real brand identity (away from Spotify-green), a rich, motion-led visual treatment for the daily pick, a Profile screen that is full of meaning from day one, and the polish layer — skeletons, haptics, transitions, intentional empty/error states, and final icon/splash.

**Status:** implemented in working tree (2026-05-29). Remaining before "done": apply the Profile migration on the live DB (`supabase db push` + `npm run db:types`), final app-icon/splash assets, and on-device QA in Expo Go.
**Depends on:** Phases 4 + 5 implemented in working tree (album detail, ratings, discoveries, share, `get_current_pick` / `get_discoveries` RPCs, library import).
**Estimated effort:** 2.5–3 weeks @ ~10–15 h/week.

---

## Implementation status (2026-05-29)

Done in the working tree (`tsc --noEmit` and `biome check` both clean):

- **Deps installed:** `expo-haptics`, `expo-image`, `expo-linear-gradient`, `expo-blur` (SDK 54 matrix) + `moti`. Worklets babel plugin auto-applied by `babel-preset-expo`.
- **Palette swapped** in `theme/colors.js` + `theme/colors.d.ts` — burgundy/cream/gold + `primary`, `on-primary`, `spotify`, and `rate-*` tokens. `SpotifyButton` moved to the dedicated `spotify` token (stays green); all other surfaces inherit the new palette via the single source of truth.
- **Typography** extended (`title`/`h3`/`label`/`subtle`); `h1` rescaled.
- **New primitives:** `lib/motion.ts` + `useReduceMotion`, `lib/haptics.ts`, `components/ui/CoverImage` (expo-image + `cssInterop`), `Card` (incl. glass/blur), `Skeleton` (moti, reduce-motion aware), `EmptyState`, `ErrorState`; `Button` extended (variants + haptic + `loading`).
- **Rich daily pick:** `AlbumDetail` rewritten as a self-contained parallax `Animated.ScrollView` with `CoverBackdrop` (blurred enlarged cover + gradient scrim, Expo-Go-safe), parallax `AlbumHero`, glass `WhyThisAlbum`, burgundy `AlbumActions` + haptics, `RatingEditor` with haptics + semantic tint dots + animated selection. Home + discovery-detail both consume it; Home/detail use skeletons and retryable error states (`PickError`/`ErrorState`).
- **Discoveries:** skeleton rows, `CoverImage` thumbnails, semantic status dots, staggered entrance (reduce-motion aware), `EmptyState`/`ErrorState`.
- **Rich Profile:** `get_profile_overview` RPC migration (`20260530000000_phase6_profile_overview.sql`, authenticated-only) + `useProfileOverview` + `TasteSection` + `ListeningSummary` + hero/streak/library/connections/settings, each with skeletons; `lib/copy.ts` tone strings.
- **Tab bar** active tint is gold automatically (token-driven; glass treatment deferred — see §17).

Not done (intentionally deferred / needs the user):

- Final **app icon + splash** assets (design task; needs user pick + native rebuild).
- **`supabase db push` + `npm run db:types`** for the new RPC (sandbox-blocked; manual).
- **On-device QA** in Expo Go (parallax/blur/haptics must be felt on a real iPhone).

---

## 0. Decisions locked for this phase

These were resolved in the Phase 6 brainstorm (2026-05-29). They are the spine of the plan.

| Decision | Choice | Notes |
|---|---|---|
| **Visual direction** | **B — Rich & "album-y"** | Color bleeds out of the cover art (blurred backdrop + gradient), pronounced parallax on the hero cover, glass surfaces, visible motion. Applied across the app, with the daily pick as the showpiece. |
| **Brand palette** | **Burgundy / cream / gold, concrete hex locked** (see §2) | Replaces `#1db954`. Gold = `accent` (highlights, active states). Burgundy = new `primary` (main CTAs). Cream = `text`. |
| **Streak rule** | **A day counts if the pick was opened OR rated** | A missed calendar day (in the user's timezone) resets the streak. Low-pressure, matches product philosophy. |
| **New dependencies** | **Allowed:** `expo-haptics`, `expo-image`, `expo-linear-gradient`, `expo-blur`, `moti` | All are Expo-Go-safe on SDK 54 (see §3). `react-native-reanimated` + `react-native-worklets` already installed. |

### Hard constraints carried from CLAUDE.md / AGENTS.md

- **Expo Go SDK 54 only.** Use only native modules bundled with the SDK. `expo-haptics`, `expo-image`, `expo-linear-gradient`, `expo-blur` are all bundled and run in Expo Go. `moti` is JS-only (rides on Reanimated). **Do NOT** add `react-native-image-colors` or any other unlisted native module — it won't load in Expo Go. We get "color from the cover" via a **blurred, enlarged copy of the cover art** (see §6.4), not pixel-level color extraction.
- **`theme/colors.js` is the single source of truth.** Confirmed: there are zero hardcoded hex literals anywhere in `app/`, `components/`, `lib/` — every JS-level color goes through `@/theme/colors`, and NativeWind classes resolve through `tailwind.config.js` which requires the same file. The palette swap is therefore a one-file change plus the `.d.ts` type. Files importing colors directly today: `app/(tabs)/_layout.tsx`, `app/discoveries/[aotdId].tsx`, `components/auth/SpotifyButton.tsx`, `components/album/AlbumActions.tsx`, `components/album/RatingEditor.tsx`, `components/onboarding/InitialSyncingScreen.tsx`.
- **English-only copy.** No i18n, no Russian strings.
- **No new product mechanics.** No skip, no public ratings, no social. Ratings stay a private journal and never feed the algorithm.
- **`AlbumDetail.tsx` is the shared surface** for Home and `/discoveries/[aotdId]`. All hero/why/share/rating polish lands there once, not duplicated.
- New RPCs must be **`authenticated`-only** (revoke `anon`/`public`), and any later change to an existing function's return shape must `drop function` before recreate. After migrations: `supabase db push` then `npm run db:types`.

---

## 1. Scope summary

In scope:

1. **Design tokens** — palette swap + extended semantic tokens, typography scale, spacing/radius tokens.
2. **Shared UI primitives** — restyled `Text`/`Button`/`Screen`, new `Card`, `Skeleton`, `EmptyState`, `ErrorState`, `CoverBackdrop`, haptics helper, `expo-image` adoption.
3. **Rich daily-pick treatment** — parallax hero cover, color-from-cover blurred backdrop, glass "Why this album", haptic interactions, animated rating selection.
4. **Discoveries polish** — skeleton loading, restyled status badges, intentional empty/error states, list entrance motion.
5. **Rich Profile** — hero card with streak, "Your taste" (top artists / decades / library span), "Listening summary", library status, connections (with Free/Premium badge), settings; backed by a new `get_profile_overview` RPC. Non-empty on day 1 from library composition.
6. **Tone-of-voice pass** — microcopy audited against humor + low-pressure + "we respect your taste".
7. **App icon + splash** — final-quality assets wired through `app.config.ts`.
8. **Accessibility + performance** — reduce-motion support, 44pt targets, image caching, FlatList tuning.

Explicitly **out of scope** (deferred to Phase 7): Sentry full integration, PostHog/Amplitude analytics, push notifications, onboarding flow, GDPR/delete-account, Spotify Extended Quota submission. The "MusicBrainz nightly pre-warm cron" listed under Phase 6 in the master plan is **already implemented** in Phase 4 (`prewarm-album-cache` at `0 3 * * *` + `prewarm-user-candidates-nightly` at `30 2 * * *`) — mark it done; no work here.

---

## 2. Design tokens — color

### 2.1. Final palette (locked)

Edit **`theme/colors.js`** to:

```js
const colors = {
  // Core surfaces (dark, warm "album-cover-y" base)
  bg: '#120a0c',          // deep wine-black
  surface: '#1d1014',     // raised surface
  'surface-2': '#2a181d', // higher surface / borders
  // Content
  text: '#f4ebe0',        // cream (primary text / on-dark)
  muted: '#9c8b86',       // warm taupe (secondary text)
  // Brand
  accent: '#d9a441',      // gold — highlights, active states, eyebrows, active tab
  primary: '#87263b',     // burgundy — main CTAs ("Open in Spotify")
  'on-primary': '#f4ebe0',// cream text on burgundy
  // Rating semantic tints (used as subtle accents, not the primary visual)
  'rate-loved': '#d9a441',  // gold
  'rate-liked': '#c98a3c',
  'rate-alright': '#9c8b86',
  'rate-notforme': '#a8636b',
  'rate-bad': '#8e3b46',
};

module.exports = colors;
```

Update **`theme/colors.d.ts`** to declare every new key (TypeScript consumers import the default). Keep the keys in sync with the JS file.

`tailwind.config.js` requires nothing new — it spreads `colors`, so `bg-primary`, `text-accent`, `border-rate-bad`, etc. become available automatically.

### 2.2. Ripple of the palette swap

- **`accent` changes meaning visually** (green → gold) but keeps its role: active tab tint, selected rating pill, "Today's album" eyebrow, `Button` ghost text.
- **`Button` primary variant** currently is `bg-accent` + `text-bg`. We split CTAs: introduce `primary` (burgundy) as the main action color and keep an accent-gold option. See §5.1.
- Re-check every direct-import file (listed in §0) renders sensibly with the new values — especially `AlbumActions` (Open/Share buttons), `RatingEditor` (selected pill `bg-accent` → gold), `SpotifyButton` (still Spotify-branded green per Spotify Design Guidelines — **the Spotify sign-in button must keep Spotify's green/brand**, do not recolor it gold).

> **Gotcha:** `components/auth/SpotifyButton.tsx` is a Spotify-branded element. Spotify Design Guidelines require their green/logo for "Connect with Spotify". This button is the one place that intentionally stays Spotify-green — do not fold it into the brand palette.

---

## 3. Dependencies

Install with SDK-matched versions, then reconcile peer deps:

```bash
# 1) SDK-pinned native modules (Expo resolves SDK 54-correct versions)
npx expo install expo-haptics expo-image expo-linear-gradient expo-blur

# 2) JS-only animation helper (not an Expo module)
npm install moti --legacy-peer-deps

# 3) Verify nothing drifted off the SDK matrix
npx expo install --check
```

**Why each:**

- `expo-haptics` — tactile feedback on rating selection, open, pull-to-refresh.
- `expo-image` — fast cover loading with disk/memory cache + `blurRadius` (used for the cover backdrop) + `placeholder`/`transition` for graceful fade-in. Replaces RN `Image` on screens (NOT in `ShareCard`, see gotcha).
- `expo-linear-gradient` — gradient scrims over the blurred cover so text stays legible.
- `expo-blur` — glass surfaces (`Why this album`, tab bar background).
- `moti` — declarative entrance/skeleton animations on top of Reanimated; fewer hand-written shared values.

> **Gotcha — ShareCard + expo-image + view-shot:** `react-native-view-shot` capture can race with async image decoding. `ShareCard.tsx` already prefetches and captures via RN `Image`. **Keep `ShareCard` on RN `Image`** to preserve reliable PNG capture; only migrate the on-screen surfaces to `expo-image`.

> **Reminder:** Plain `npm install` fails ERESOLVE in this repo — always `--legacy-peer-deps`. `react` / `react-native` stay pinned exact. These are manual steps for the user to run (sandbox blocks `npm`).

---

## 4. Typography & spacing scale

### 4.1. `components/ui/Text.tsx`

Extend variants so screens stop hand-rolling sizes. Add `h3`, `title` (hero album title), `label` (uppercase eyebrow), and `subtle` (muted small). Keep existing `h1/h2/body/caption`. Example target set:

```ts
const variantClasses: Record<Variant, string> = {
  title:   'text-text text-3xl font-bold tracking-tight',  // hero album title
  h1:      'text-text text-2xl font-bold tracking-tight',
  h2:      'text-text text-xl font-semibold',
  h3:      'text-text text-lg font-semibold',
  body:    'text-text text-base',
  caption: 'text-muted text-sm',
  label:   'text-accent text-xs font-semibold uppercase tracking-widest',
  subtle:  'text-muted text-xs',
};
```

Add an optional `weight`/`color` escape hatch only if a screen truly needs it — prefer variants.

### 4.2. Spacing & radius conventions

We stay on Tailwind/NativeWind spacing. Document conventions in this plan (no token file needed):

- Screen gutters: `px-5` (already the `Screen` default).
- Card radius: `rounded-2xl` for large cards, `rounded-xl` for inner blocks, `rounded-full` for pills/avatars.
- Section vertical rhythm: `gap-5` between major blocks, `gap-3` within a block.
- Cards sit on `surface`; inner blocks on `surface-2` or glass.

---

## 5. Shared UI primitives

All live under `components/ui/`. Build these first — every screen depends on them.

### 5.1. `Button` (extend existing)

- Add a `primary` (burgundy `bg-primary` + `text-on-primary`) and keep/rename today's gold style. Proposed variants: `primary` (burgundy CTA), `accent` (gold CTA), `secondary` (`surface-2`), `ghost`, and a new `glass` (blur background, used on the rich hero where the backdrop shows through).
- Add `onPress` haptic: a light impact on primary/accent presses via the haptics helper (§5.6). Respect a `haptic={false}` opt-out.
- Add optional `loading` prop → swaps label for a small spinner/inline state instead of callers toggling title strings.
- Keep the `title` prop name (not `label`) — codebase convention.

### 5.2. `Card`

`components/ui/Card.tsx` — `surface` background, `rounded-2xl`, `p-5`, optional `glass` mode (renders `expo-blur` `BlurView` + translucent border). Used by Profile sections, Why-this-album, Discoveries rows.

### 5.3. `Skeleton`

`components/ui/Skeleton.tsx` — shimmer placeholder using `moti`'s `Skeleton` (or a custom Reanimated pulse). Variants: `line` (text rows), `block` (cover squares), `pill`. Replaces `ActivityIndicator` on first load in: `app/(tabs)/discoveries.tsx`, `app/discoveries/[aotdId].tsx`, the Home pick area, and Profile sections. Keep `ActivityIndicator` only where a spinner is genuinely correct (e.g., inline button busy state in `SpotifyButton`).

### 5.4. `EmptyState`

`components/ui/EmptyState.tsx` — centered icon/illustration + title + subtitle + optional action. Replaces the ad-hoc empty blocks in Discoveries. Copy follows the tone guide (§9).

### 5.5. `ErrorState`

`components/ui/ErrorState.tsx` — title + body + "Try again". Replaces inline error blocks in Discoveries and `[aotdId]`. **Must preserve the existing rule:** RPC/network failures render retryable error, never silent empty/"not found" (Home `PickError`, Discoveries error, discovery-detail error).

### 5.6. `lib/haptics.ts`

Thin wrapper over `expo-haptics` with named intents so call sites read well and we can globally honor reduce-motion / a future setting:

```ts
// selection() | impactLight() | impactMedium() | success() | warning()
```

Each call is wrapped in try/catch (haptics must never throw into a user action) and is a no-op if reduce-motion or a "reduce haptics" preference is on.

### 5.7. `components/ui/CoverImage.tsx`

Wrapper over `expo-image` with our defaults: `contentFit="cover"`, `transition={200}`, `cachePolicy="memory-disk"`, a `surface-2` placeholder, and a `blurRadius`/`scale` mode for backdrop usage. Centralizes cover rendering so AlbumHero, DiscoveryListItem, ShareCard-on-screen, and Profile reuse one component. (ShareCard's capture target stays RN `Image` — see §3 gotcha.)

---

## 6. Rich daily-pick treatment (direction B)

The showpiece. All edits land in the shared `AlbumDetail` / `AlbumHero` tree, so Home and `/discoveries/[aotdId]` both get it.

### 6.1. Parallax hero cover

- Convert the album-detail scroll container to an Animated `ScrollView` (Reanimated `useAnimatedScrollHandler` + `useSharedValue` for scroll offset), or wrap with `moti`.
- The hero cover translates/scales subtly on scroll (cover moves slower than content, slight scale-up when overscrolling at top — the classic "stretchy header"). Keep it tasteful, not extreme.
- **Reduce-motion:** if `AccessibilityInfo.isReduceMotionEnabled()` is true, disable the parallax transform (static cover).

### 6.2. Color-from-cover backdrop (Expo-Go-safe)

- Behind the hero/header, render the **same cover art** through `CoverImage` in backdrop mode: enlarged, `blurRadius` high, low opacity, absolutely positioned, clipped.
- Overlay an `expo-linear-gradient` scrim fading from transparent (top) to `bg` (bottom) so the title/meta sit on solid color and stay legible.
- This produces the "color bleeds from the cover" effect **without** pixel color extraction (which needs a native module unavailable in Expo Go). When there's no cover URL, fall back to a static burgundy→bg gradient.

### 6.3. Glass "Why this album"

- `WhyThisAlbum` renders inside a `Card` in `glass` mode (blur) sitting over the backdrop, with the gold `label` eyebrow. Keep the existing human formatter for `selection_reason` — no copy logic change, only presentation.

### 6.4. Actions & rating microinteractions

- `AlbumActions`: "Open in Spotify" becomes a `primary` (burgundy) CTA; "Share" a `glass`/`ghost` button. Light haptic on open; medium haptic on a successful share dialog launch.
- `RatingEditor`: selecting a level fires `haptics.selection()`, the chosen pill animates (scale/▴ color via `moti`), and saving fires `haptics.success()`. Selected pill uses gold (`accent`) as today, but each level may carry its semantic tint as a small dot/border (`rate-*` tokens) — words stay the primary visual (no emoji-first).
- The Free-Spotify heads-up line and explainer behavior are unchanged (still awaits dismissal before opening; SecureStore flag best-effort).

### 6.5. Home screen specifics (`app/(tabs)/index.tsx`)

- "Today" heading + the parallax `AlbumDetail`. While `isLoading`, show a **pick skeleton** (cover block + title lines + button blocks) instead of the current `null`.
- `WaitingForPick` / `PickError` get the new visual language (gradient, illustration), but keep their exact semantics (waiting only on a successful no-row response; errors are retryable — do not mask ops failures as waiting).
- Keep the "past picks are still waiting" nudge; restyle as a subtle `Card`.

---

## 7. Discoveries polish (`app/(tabs)/discoveries.tsx`, `DiscoveryListItem`, `StatusTabs`)

- First-load: a list of `Skeleton` rows instead of the centered `ActivityIndicator`.
- `DiscoveryListItem`: `CoverImage` thumbnail, restyled status badge using a tokenized map: `🆕 New / 👂 Opened / ✓ Loved / ✓ Liked / · Alright / ✕ Not for me / ✕ Bad / ⏳ Pending` → colored chips driven by `rate-*` + `accent`/`muted`. Subtle entrance fade/stagger via `moti` on mount.
- Empty + error states use the new `EmptyState` / `ErrorState`. Keep the existing label semantics: middle filter is **"Unrated"** (covers both `pending` and `opened`); keep per-item "Opened" badge.
- Do not change pagination (`get_discoveries` defaults stay; client still calls with only `p_user_id`).

---

## 8. Rich Profile (`app/(tabs)/profile.tsx`)

The biggest net-new UI. Absorbs the cancelled Stats tab. Must be meaningful on day 1 from library composition (don't wait for accumulated ratings).

### 8.1. Sections (top → bottom)

1. **Hero card** — avatar + `display_name` + streak line: e.g. `"12-day streak · 47 albums discovered"`. If streak is 0/disabled-day, show a gentle line (`"Your taste, one album at a time"`). Avatar from Spotify.
2. **Your taste** — top artists from the library (chips), decade distribution (simple bar/segments), and library span (`"Your library spans 1968–2024"`). Driven by aggregated library data, available immediately post-import.
3. **Listening summary** — `rated this month`, `loved` count, `avg score`, with a tap that deep-links to the filtered Discoveries (`rated`). Shows a friendly "nothing yet" line before the first rating, not a zero-wall.
4. **Library status** — `X albums tracked · synced 2h ago` (reuse `useLibraryStats` + `relativeTime`) + the manual **Sync now** button. `SyncBanner` stays Profile-only (Home/Discoveries never show sync).
5. **Connections** — `✓ Spotify connected as {display_name}` + Free/Premium product badge (from `streaming_connections_safe.spotify_product`). Disconnect/reconnect affordance can be a stub that points to sign-out for v1 (full reconnect flow is Phase 7); state this explicitly.
6. **Settings** — push time placeholder (wired in Phase 7), `Sign out`. `Delete account` is Phase 7 — show the row disabled or omit; do not half-build it.

Each section is a `Card`; sections load independently with skeletons.

### 8.2. Data layer — `get_profile_overview` RPC

One RPC to populate the screen in a single round trip. New migration `supabase/migrations/<ts>_phase6_profile_overview.sql`.

```sql
create or replace function public.get_profile_overview(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- assemble: streak, total_discovered, taste{top_artists, decades, span_min, span_max}, listening{rated_this_month, loved_count, avg_score, total_rated}
  -- ... (see computation notes below)
  return v_result;
end;
$$;

revoke all on function public.get_profile_overview(uuid) from public, anon, authenticated;
grant execute on function public.get_profile_overview(uuid) to authenticated;
```

**Computation notes (all server-side; aggregating a 10k-row library client-side is a no-go):**

- **Top artists:** `user_library_active` grouped by `artist_name`, count desc, limit ~8. **Ignore low-signal pseudo-artists** (`Various Artists`, `Unknown`) per the recommendation guardrail — same exclusion list.
- **Decades / span:** bucket `release_year` by decade; `min`/`max(release_year)` for the span, ignoring nulls.
- **Total discovered:** count of `albums_of_the_day` for the user.
- **Listening summary:** from `ratings` — `count` where `updated_at` in current month, `count` where `score = 5` (loved), `avg(score)`, total rated.
- **Streak (opened OR rated):** over `albums_of_the_day`, a day at `date = d` *qualifies* if `status in ('opened','rated')`. Current streak = the length of the consecutive run of qualifying days ending at **today or yesterday** (user's local date via `safe_profile_timezone`). Grace: if today's pick exists but isn't opened yet, the streak still counts up to yesterday (we don't punish "haven't opened today's pick at 8am"). If yesterday didn't qualify and today hasn't either, streak = 0. Compute with a gap-and-island query over the ordered `date` column.

> Keep the function consistent with the grant-hardening convention: `authenticated`-only, never `anon`/`public`. If a later migration changes its return shape, `drop function public.get_profile_overview(uuid);` first.

### 8.3. Hook — `lib/hooks/useProfileOverview.ts`

`useQuery(['profile-overview', userId])` calling `supabase.rpc('get_profile_overview', { p_user_id: userId })` **inline** (never detach `supabase.rpc`). Between migration and `npm run db:types`, cast through `never` as documented, then assert the jsonb shape into a typed `ProfileOverview`.

> After applying the migration: user runs `supabase db push` then `npm run db:types`. Until types regenerate, the `as never` cast keeps the app compiling.

---

## 9. Tone of voice pass

- Audit every user-facing string against: **humor + low pressure + "we respect your taste."**
- Collect the recurring copy into `lib/copy.ts` (constants) where it reduces duplication (empty states, streak lines, why-this-album fallbacks, rating microcopy) — but don't over-abstract one-off strings.
- Keep the Phase 5 rating microcopy contract: first rating shows the journal-not-algorithm note. Keep the "Why this album" formatter output.
- All English. No emoji as a primary visual (status badges may use a small glyph, but words lead).

---

## 10. Tab bar (`app/(tabs)/_layout.tsx`)

- `tabBarActiveTintColor` → `colors.accent` (now gold).
- Optional: `expo-blur` `BlurView` as `tabBarBackground` for a glass bar consistent with direction B; keep `tabBarStyle` background fallback for reduce-transparency. Verify Expo Go renders the blur on device.
- Icons stay Ionicons (`disc` / `sparkles` / `person`); only color/treatment changes.

---

## 11. App icon + splash

- Spec: warm burgundy field, a single gold "disc/album" mark, cream wordmark optional. Square master at 1024×1024; splash mark on `#120a0c` (matches current `app.config.ts` `backgroundColor`).
- Wiring already exists in `app.config.ts` (`icon`, `expo-splash-screen` plugin, Android adaptive icon set). **Replacing the PNGs in `assets/` is enough** — no config change unless filenames change.
- **This is a design-asset task.** Claude can produce a draft via the canvas/Figma tooling, but final icon selection/approval is the user's call. Treat as: produce 1–2 icon concepts → user picks → drop final PNGs into `assets/` (`icon.png`, `splash-icon.png`, Android foreground/background/monochrome, `favicon.png`).
- After swapping assets, a native rebuild (EAS/dev build) is needed to see the icon; the splash shows in Expo Go.

---

## 12. Accessibility & performance

- **Reduce motion:** central check (`AccessibilityInfo.isReduceMotionEnabled` + change listener, e.g. `lib/hooks/useReduceMotion.ts`) gates parallax, entrance animations, and skeleton shimmer (fall back to static/opacity). Haptics helper also honors it.
- **Touch targets:** min 44pt (rating pills already `min-h-11`); audit new chips/buttons.
- **Images:** `expo-image` memory-disk cache; backdrop uses a downscaled source + blur to avoid decoding full-res twice. Prefetch the hero cover (already done for share) before showing.
- **Lists:** keep FlatList; verify `DiscoveryListItem` is memoized and entrance animation doesn't re-trigger on scroll recycling.
- **Glass/blur cost:** blur views are GPU-cheap on modern iPhones but test on the oldest target device; cap blur radius.

---

## 13. Build sequence (ordered)

Designed so each step leaves the app runnable on device.

**Milestone 1 — foundation (≈ week 1)**
1. Install deps (§3); `npx expo install --check`.
2. Swap palette in `theme/colors.js` + `theme/colors.d.ts` (§2). Smoke-test every screen for legibility; confirm `SpotifyButton` stays Spotify-green.
3. Extend `Text` variants (§4.1); add spacing conventions.
4. Build primitives: `haptics.ts`, `CoverImage`, `Card`, `Skeleton`, `EmptyState`, `ErrorState`, `useReduceMotion` (§5, §12). Extend `Button` (§5.1).
5. Migrate first-load spinners → skeletons where trivial.

**Milestone 2 — daily pick + discoveries (≈ week 2)**
6. AlbumDetail: parallax hero + cover backdrop + gradient scrim (§6.1–6.2).
7. Glass "Why this album"; restyle `AlbumActions` CTAs (§6.3–6.4).
8. RatingEditor haptics + animated selection (§6.4).
9. Home loading skeleton + restyled Waiting/Pick-error (§6.5).
10. Discoveries: skeletons, badge restyle, entrance motion, Empty/Error states (§7).
11. Tab bar restyle + optional glass (§10).

**Milestone 3 — profile + finish (≈ week 3)**
12. `get_profile_overview` migration + grants (§8.2). User runs `supabase db push` + `npm run db:types`.
13. `useProfileOverview` hook (§8.3).
14. Rich Profile screen sections (§8.1) with per-section skeletons.
15. Tone-of-voice sweep + `lib/copy.ts` (§9).
16. Icon/splash concepts → user pick → asset swap (§11).
17. Reduce-motion + perf audit on device (§12).
18. Final device QA pass; update master-plan "what changed".

---

## 14. Verification checklist

- App boots and runs in **Expo Go on a real iPhone** (not just simulator) — direction B leans on blur/motion that must be checked on device.
- `npx tsc --noEmit` clean for the app (Edge Functions excluded as usual); Biome passes.
- New RPC: `get_profile_overview` returns sane data for (a) fresh user (library only, no ratings), (b) user with ratings, (c) user mid-streak, (d) broken streak. Verify `authenticated`-only grants; `anon` cannot execute.
- No screen shows `#1db954`; gold/burgundy everywhere except the Spotify-branded sign-in button.
- Reduce-motion ON → no parallax/shimmer, app still fully usable; haptics suppressed.
- Discoveries/Detail still surface **retryable errors** (no silent empty/"not found") on RPC failure.
- Share still produces a correct PNG (ShareCard untouched on RN `Image`).
- Profile is non-empty on a day-1 account (top artists/decades/span present from library).

---

## 15. Risks & gotchas

| Risk / gotcha | Mitigation |
|---|---|
| `react-native-image-colors` (or other unlisted native module) won't load in Expo Go | Use blurred-cover backdrop for "color from cover" (§6.2); no pixel extraction. |
| Plain `npm install` ERESOLVE; SDK drift | `npx expo install` for Expo modules; `--legacy-peer-deps` for moti; `npx expo install --check`. Manual user steps. |
| `expo-image` + view-shot capture races → blank share cards | Keep `ShareCard` on RN `Image`; only on-screen surfaces use `expo-image`. |
| Blur/parallax jank on older devices | Cap blur radius, downscale backdrop, gate motion behind reduce-motion, test on device. |
| Palette swap breaks contrast somewhere | Single-file change but smoke-test all screens; cream-on-wine and gold-on-wine verified in mockup. |
| Recoloring the Spotify sign-in button | Explicitly leave `SpotifyButton` Spotify-green (Design Guidelines / future Quota review). |
| New RPC over-granted | `revoke from public,anon,authenticated; grant execute to authenticated;` — match audit convention. |
| Streak query off-by-one across timezones | Compute local date via `safe_profile_timezone`; grace window includes "today not yet opened" (§8.2). |
| Detaching `supabase.rpc` | Always call inline; cast `as never` until `db:types` regenerated. |
| Icon needs native rebuild | Splash visible in Expo Go; icon needs EAS/dev build — note for the user. |

---

## 16. Manual steps for the user (sandbox-blocked / decisions)

In order:

1. `npx expo install expo-haptics expo-image expo-linear-gradient expo-blur`
2. `npm install moti --legacy-peer-deps`
3. `npx expo install --check` (confirm SDK 54 matrix)
4. After the Profile migration is added: `supabase db push` then `npm run db:types` (regenerates `types/database.ts`; removes the temporary `as never` casts).
5. Pick the final icon concept; confirm the brand palette feels right on a real screen.
6. Run / test on a physical iPhone via Expo Go.

Order matters: deps before code that imports them; `db push` before `db:types`; both before relying on typed RPC results.

---

## 17. Open questions (resolve during the phase)

- [ ] Decade distribution visual: simple stacked bar vs sparkline vs labeled segments? (decide with a quick mock when building §8.1).
- [ ] Streak grace exact wording on Home/Profile when today's pick is still pending.
- [ ] Glass tab bar: keep if it looks right on device, otherwise solid `bg` with gold active tint.
- [ ] Final icon concept (user pick).
- [ ] Whether to expose a "reduce haptics"/"reduce motion" toggle in Settings now, or rely solely on the OS setting (lean: OS-only in v1).
