## Agent Operating Mode

Optimize for high-signal work and low token spend.

Before editing:

- Read only the context needed for the task. Start with this file, the touched file(s), and the nearest related controller/hook/test; do not crawl the repo.
- Prefer `rg`/`rtk grep` for discovery, then open only the matching files and narrow line ranges.
- Check `rtk git status` before edits. If `AGENTS.md` or touched files are already dirty, preserve user changes and patch around them.
- Do not read `.env*`, secrets, service-role keys, generated caches, or large build artifacts.
- Do not use `README.md` for product truth unless this file and current code do not answer the question.

Shell/token rules:

- Use RTK for noisy commands:
  - `rtk git status`
  - `rtk git diff -- <path>`
  - `rtk ls <path>`
  - `rtk read <file>`
  - `rtk grep "<pattern>" <path>`
  - `rtk test "<command>"`
  - `rtk tsc`
  - `rtk lint`
- Do not use raw `cat`, raw `git diff`, broad `ls -R`, or huge test logs unless exact full output is explicitly required.
- Prefer targeted commands over broad ones: one file diff, one focused grep, one relevant test file, then expand only if evidence says to.
- For long-running or verbose tools, use quiet flags where available and summarize failures by file/line/error instead of pasting logs.
- If a command fails because RTK filtered too much for diagnosis, rerun the smallest possible raw command with exact scope.

Implementation rules:

- Make the smallest coherent change that satisfies the request and preserves the product contracts below.
- Keep route files thin; put behavior in shared controllers/hooks and presentation in the editorial skin.
- Avoid speculative refactors, new dependencies, broad formatting, or touching generated files unless the task requires it.
- When changing database functions, policies, auth, sync, or recommendation code, inspect the relevant migration/function and grants before editing.
- When changing UI, inspect the existing component/skin pattern first and reuse tokens/components before introducing literals.

Validation rules:

- Run only the validation that matches the touched surface:
  - app/client TypeScript: `rtk tsc`
  - lint/style: `rtk lint`
  - focused npm test: `rtk test "<test command>"`
  - Supabase/Deno logic: targeted Deno test for the touched function/module
- Use `make check` only when the change has broad app impact or the user asks for full validation.
- If validation cannot run because of missing credentials, linked Supabase state, Expo device constraints, or unavailable tooling, state that clearly and list the exact command the user should run.

Final-response rules:

- Lead with what changed and where; mention validation in one short line.
- Do not paste large diffs or logs. Reference files and commands.
- Include manual follow-up reminders only when they are actually required by the change, such as migration push, DB type regeneration, function deploy, dependency install, or Metro cache clear.

# Album of the Day - Agent Guide

Last updated from the working tree on 2026-06-11.

This file is for both humans and AI agents. It should describe the project as it is now, not as an older phase plan described it.

## Quick Orientation

Album of the Day is an iOS-first Expo/React Native app. A signed-in Spotify user gets one album per local calendar day, opens it in Spotify, rates it privately, and builds a Discoveries archive.

Current app shape:

- Expo SDK 54, React Native 0.81.5, React 19.1.0, TypeScript strict.
- Expo Router routes: auth sign-in, OAuth callback, bottom tabs for Home / Discoveries / Profile, and discovery detail.
- Styling is NativeWind v4 plus a locked editorial skin.
- Backend is Supabase Postgres + Auth + Deno Edge Functions.
- Spotify is the music provider. Last.fm and MusicBrainz are metadata/signal providers.
- Recommendation compute is cache-first, service-role only, and designed around external API rate-limit safety.

Do not treat `README.md` as current product truth. It still contains older Phase 1 details. Prefer this file, current code, migrations, and the latest plans listed near the end.

## Source Of Truth Order

When sources conflict, use this order:

1. Current code and migrations.
2. This `AGENTS.md`.
3. Fresh plan files with explicit Done / locked decision sections, especially:
   - `plans/editorial-redesign-final.md`
   - `plans/discovery-improvements-v2.1.md`
   - `plans/artist-country-chip.md`
   - `plans/safe-discovery-observability-plan.md`
   - `plans/api-request-optimization-plan.md`
   - `plans/day-1-onboarding-pick-remediation-plan.md`
   - `plans/discoveries-pivot.md`
   - `plans/profile-screen-design-remediation-plan.md`
   - `plans/comprehensive-debug-audit-remediation-plan.md` — audit-originated follow-up; Phases 1, 3–6 shipped (incl. Phase 4 API strictness, Phase 5 UI/accessibility partially shipped), Phase 2 (Day-1 recommendation correctness) in progress.
4. Older phase plans as historical context only.
5. `README.md` as onboarding prose only, not implementation truth.

## Commands And Dependency Rules

Use these scripts:

- `npm run start` - Expo dev server.
- `npm run ios` / `npm run android` / `npm run web`.
- `npm run lint` - Biome check.
- `npm run format` - Biome format.
- `npm run typecheck` - app TypeScript only; Supabase functions are excluded.
- `npm run db:new -- <name>` - create a migration.
- `npm run db:push` - push migrations to the linked Supabase project.
- `npm run db:types` - regenerate `types/database.ts` from the linked project.
- `make check` - lint + typecheck.
- Deno unit tests live under `supabase/functions/**/*.test.ts`. Run targeted tests with Deno/Supabase tooling, not the Expo app `tsc`.

Hard dependency rules:

- Always run `npm install` with `--legacy-peer-deps`.
- Keep `react` and `react-native` exact, with no `^` or `~`.
- When bumping Expo SDK, first check the installed App Store Expo Go app: Profile -> Supported SDK. Keep the project on an SDK supported by the user's device Expo Go.
- For SDK 54, `expo-auth-session` is `~7.0.11`.
- Reanimated 4 needs `react-native-worklets` installed explicitly.
- If `npx` or nested npm is missing in Codex desktop, run commands with `PATH=/opt/homebrew/bin:$PATH`.
- `postcss` has an npm override (`"postcss": ">=8.5.10"`) to resolve GHSA-qx2v-qp2m-jg93 while `@expo/metro-config@54` pins `~8.4.32`. Do not remove the override until Expo upgrades its metro-config postcss constraint past 8.5.10.
- The remaining `uuid` 7.x advisory (GHSA-w5hq-g745-h8pq, 13 paths via `xcode`) is accepted: `xcode` calls only `uuid.v4()` without a `buf` argument, so the vulnerability (buffer bounds check in v3/v5/v6 when `buf` is provided) is not exploitable. Will resolve when Expo upgrades `xcode`.
- Stray parent `node_modules` directories can poison resolution. If runtime versions look impossible, check parent directories.

Manual step reminders:

- After adding or changing migrations, the user must run `supabase db push` and then `npm run db:types`. The order matters because types should reflect the live linked DB after migrations apply.
- After changing Edge Functions, the user must deploy the changed functions, for example `supabase functions deploy compute-album-of-the-day`.
- If dependency changes are needed, remind the user to run the exact install command with `--legacy-peer-deps`.
- Never ask the app to ship service-role keys. Only public anon env values belong in the app.

## Repo Shape

- `app/` - Expo Router screens. Route files should stay thin.
- `components/skins/shared/` - behavior controllers. Data fetching, navigation, share/open/rating/sync/OAuth orchestration lives here.
- `components/skins/editorial/` - current presentation skin.
- `theme/skins/` - skin registry, font loading, shared accent animation.
- `components/ui/` - app primitives such as `Text`, `Button`, `Screen`, `Card`, `Badge`, states, progress, cover image.
- `lib/` - Supabase client, auth, env, copy, formatting, query hooks, recommendation helpers, haptics/motion, navigation chrome helpers.
- `supabase/migrations/` - database schema, policies, grants, RPCs, operational views.
- `supabase/functions/` - Deno Edge Functions and shared recommendation/API modules. Day-1 ordering and deferral live in `supabase/functions/_shared/day1-onboarding.ts` and `supabase/functions/_shared/day1-deferral.ts`; entrypoint functions resolve their `Day1Deps` and delegate.
- `types/database.ts` - generated from Supabase; do not hand-edit except as a temporary fallback if CLI/login is unavailable.
- `design/mockups/` and `plans/` - current design/reference material.
- `scripts/` - one-off dev generators (currently `generate-paper-grain.mjs` for `assets/textures/paper-grain.png`); not wired into the build.
- `plans/archive/` - historical phase plans and retired planning notes; useful for archaeology, not source of truth.

General conventions:

- Path alias `@/*` resolves to the repo root; see `tsconfig.json`.
- `global.css` is intentionally excluded from Biome because Tailwind directives are not valid ordinary CSS to its linter.
- Keep import/style patterns aligned with nearby files. Prefer focused changes over broad refactors.
- Use token imports from `theme/colors.js` for JS-level colors before introducing literals.
- For shared Deno modules that need a stubbable Supabase surface, prefer a narrow structural type (e.g. `Pick<SupabaseClient, 'rpc'>`) over the full client so tests don't pull transitive npm deps.

## Product Invariants

Keep these behaviors unless the user explicitly changes the product plan:

- V1 UI copy is English only. Do not add i18n or Russian UI strings.
- Bottom tabs are Home / Discoveries / Profile. Do not recreate Library, Friends, or Stats tabs.
- The old Library UI is intentionally gone, but the Spotify library import backend remains essential to recommendations.
- No skip mechanic exists. `albums_of_the_day.status` is only `pending | opened | rated`.
- Ratings are five emotional labels: `Loved it`, `Liked it`, `It was alright`, `Not for me`, `Bad`. They map to scores 5..1.
- Ratings are a private journal and sharing/stats input, not recommendation input. The algorithm reads `user_library` and recommendation history, not `ratings`.
- First-time rating microcopy must explain that ratings do not tune tomorrow's pick.
- "Why this album?" is mandatory on the album surface. It comes from `selection_reason` and should stay short, human, humorous, and low-pressure.
- Recommendations must be album/EP/mixtape-like releases, not one-track singles, compilations, live records, soundtracks, remix/DJ-mix release groups, or repeated variants.
- Algorithm copy and ranking must not rely on genre taxonomy.
- Spotify Free/Open users get a persistent soft badge and a one-time awaited explainer before opening Spotify.
- Share is file-first: generate a PNG share card via `react-native-view-shot`, prefetch the cover, use React Native `Share.share` on iOS (no `expo-sharing` availability gate), and `expo-sharing` elsewhere (gated by `Sharing.isAvailableAsync()`).

## Current UI And Skin System

The accepted visual direction is the editorial/PRESS skin. There is no active generative skin and no skin toggle in current code.

Important contracts:

- `theme/skins/registry.ts` exposes only `editorial`.
- Shared controllers own behavior; skin views receive props and callbacks. Do not duplicate product logic in skin views.
- `app/(tabs)/index.tsx` renders `AlbumDetail` directly for the successful Home state. Loading/error/waiting states use skin states.
- `components/album/AlbumDetail.tsx` is a thin wrapper around `AlbumDetailController`.
- Discovery and Profile route files render shared controllers.
- `AlbumDetail` owns full-bleed/parallax success surfaces and is not wrapped in `Screen`.
- Off-screen `ShareCard` must remain backed by React Native `Image`, not `expo-image`, so view-shot capture stays reliable.
- `ShareCard` is format-parameterized: `square` (default), `story`, and `minimal`. The share affordance includes an editorial ink/paper segmented picker, but the PNG path stays file-first via `react-native-view-shot`, cover prefetch, core RN `Image`, RN `Share.share` on iOS, and `expo-sharing` elsewhere. The minimal ticket is cover-free and is the automatic fallback when artwork is missing or prefetch fails. Barcode widths remain deterministic from the Spotify album id.
- Pull-to-refresh (`RefreshControl`, ink tint, `progressViewOffset` set to top inset) is wired on the Home today pick, the Discoveries archive list, and Profile. The album surface refresh is optional: `AlbumDetailView` only renders a `RefreshControl` when `onRefresh` is passed, so Home gets it (via `useTodayPick` refetch) but the discovery detail route does not. Profile's `onRefresh` fans out to all four profile queries; `refreshing` tracks the overview query.
- The album detail `Animated.ScrollView` sets `automaticallyAdjustKeyboardInsets`, `keyboardDismissMode="interactive"`, and `keyboardShouldPersistTaps="handled"` so the private rating note is not hidden by the keyboard. Keep these when touching that scroll view.
- The app boot/loading splashes in `app/_layout.tsx` (`BootSplash`) use the editorial `BrandMark` plus a mono caption on paper, not bare `Text`. Keep all three gate states (fonts, session, music profile) routed through `BootSplash`.
- `RouterGuard` in `app/_layout.tsx` renders a `Stack` (not `Slot`) at the root with `headerShown: false`. The root `Stack` is required so cross-group pushes (e.g. tab → `app/discoveries/[aotdId].tsx`) actually stack; with `Slot` at root, `router.push` degraded to a no-stack navigation and `router.back()` from discovery detail fell through to a `replace('/(tabs)/discoveries')` that landed on the default first tab (Home) instead of Discoveries.

Bottom navigation contracts:

- `app/(tabs)/_layout.tsx` owns the bottom tab chrome. Keep visible tab labels exactly Home / Discoveries / Profile (rendered lowercase via the `lowercase` class — preserve the lowercase transform).
- The tab bar is safe-area-aware. Use `lib/navigationChrome.ts` helpers for tab bar height, top/bottom padding, item height, and tab-screen bottom content padding instead of hardcoded `pb-24`, `height: 76`, or hand-rolled `insets.bottom + ...` values.
- `SkinChrome.tabBar` carries tab-bar visual tokens including background, border, active/inactive tint, active indicator, label font/size, and icon size. Keep new tab-bar visual changes flowing through these tokens where practical.
- The editorial tab bar uses a printed-rule active indicator, static ink/paper styling, and best-effort haptics through `lib/haptics.ts`. Do not replace it with glass, pill/card, floating, or old dark SaaS navigation treatments.
- `tabBarHideOnKeyboard` should stay enabled so rating notes and other text inputs are not crowded by the bottom navigation.
- Today’s Home success surface is tab-screen content and should use tab-aware bottom spacing. Discovery detail is outside `(tabs)` and remains a focused detail route with its back button rather than a persistent bottom tab bar.
- The discovery detail back button uses `goBackToDiscoveries()`: native `router.back()` when `router.canGoBack()` (preserves list scroll position and the iOS edge-swipe gesture), falling back to `router.replace('/(tabs)/discoveries')` only for cold deep links. Do not revert it to an unconditional `replace`.

Editorial design contracts:

- Palette source of truth is `theme/colors.js` and `components/skins/shared/skinStyles.ts`.
- Editorial design tokens live in `components/skins/shared/skinStyles.ts`: `space` (4pt scale s1–s8), `tracking` (`label` 0.8 / `micro` 1.0 / `kicker` 1.4), `ruleWeight` (`hairline` 1 / `rule` 2 / `heavy` 3). Use these instead of ad-hoc pixel margins, letterSpacing literals, or one-off rule heights. `EditorialSectionRule` takes a `weight` prop keyed to `ruleWeight`.
- Pressed states on editorial bordered controls invert ink↔paper (print-impression feel), implemented with local `useState` + `onPressIn`/`onPressOut` — NOT Pressable style functions (NativeWind v4 reliability) and NOT `active:opacity-*`. Handlers call `setPressed(false)` first inside `onPress` so an app-switch (Spotify deep link) cannot strand a stuck inverted state. Applies to `EditorialActionButton` (own file, `components/skins/editorial/EditorialActionButton.tsx`), archive filter tabs, the rated-archive link, and the "Open in Spotify" CTA.
- The album-detail cover renders as a print plate: paper margin (`space.s3` padding) with `EditorialCropMarks` at the corners (marks sit on paper, never over artwork), a `border-2` ink frame around the artwork, and the album title overlapping the plate by -14 via a `zIndex: 2` View wrapper (zIndex on a bare `Text` is unreliable in RN). Year/country marker chips stay inside the frame bottom-right; the spec line may also repeat available colophon facts (year, artist, tracks, runtime, country) but never genres.
- All editorial surfaces (album detail, archive, profile, sign-in, initial sync, share card) carry a static `PaperGrain` overlay (`components/skins/editorial/PaperGrain.tsx`): core RN `Image` with `resizeMode="repeat"`, `pointerEvents="none"`, zIndex 20, opacity 0.05 (0.06 on the share card). The tile is `assets/textures/paper-grain.png`, regenerated deterministically by `scripts/generate-paper-grain.mjs` (dependency-free, seeded). Mount grain as a sibling of scroll containers, never inside them.
- `EditorialMasthead` provides the thin running-head on Home, Discoveries, and Profile: publication wordmark, optional issue/date aside, and an ink rule. Home uses it for the daily `№`/date line instead of a separate kicker; large screen titles still stay below it.
- The "Why this one?" paragraph renders through `ReasonParagraph` with a raised initial cap (inline Archivo first letter); true wrapped drop caps are not reliable in RN — keep the raised-cap approach. Non-letter first characters fall back to plain prose.
- A saved rating shows a decorative `EditorialStamp` ("Rated 0X", stamp red, -3° rotation) on the ballot, driven by persisted `album.rating_score` (not local selection state) and hidden from screen readers — the ballot rows carry the accessible selected state.
- The Discoveries archive list groups rows by month: `buildArchiveItems` produces a flat header/row union for the `Animated.FlatList`; month headers carry the 2px rule, so the first row of each group drops its top border. Keep keys as `month-<label>` / `aotd_id`. Archive rows are compact back issues with a 40px cover thumbnail, issue/title/artist text, and a trailing coral-bordered rating stamp (`0X`) or `WAITING` tag.
- Profile Taste-map top artists render as a single ruled ledger (`border-y-2` container, hairline separators), not stacked bordered boxes.
- The share card footer is a decorative deterministic pseudo-barcode (`barcodeWidths` seeded by Spotify album id — stable across captures) plus an "AOTD · No. N" colophon and the album URL.
- The "Open in Spotify" CTA stripe uses `accentStatic` (CTA accent is allowed); do not use rating-tone gold there. Share is a full-width paper-tone `EditorialActionButton` ("Share this issue"), not a quiet text link.
- Current base is warm paper/ink with `accent` / `accentStatic` `#ff4a2e`, flowing accent colors, and Spotify green only for Spotify-branded UI.
- Do not reintroduce the old glass/rounded/dark SaaS look as the default.
- The album cover is the dominant visual surface. Avoid generic decorative blobs/orbs.
- Tags/chips are static ink/paper markers, not flowing accent.
- Editorial Profile is a listening identity page first, not a settings ledger. Keep identity, Taste map, and Listening visually strongest; Production notes, Connections, and Log out should stay quieter. The identity block may show `SUBSCRIBER SINCE <month year>` from `profiles.created_at` when available and a coral `VOL.` chip for a positive streak; the top streak/issues/rated metrics render as one printed stat strip with internal dividers.
- Profile loading must be honest: do not render placeholder zero metrics while `overviewLoading` is true. Use skeleton/loading treatments and only show empty states after overview data has finished loading.
- Profile uses safe-area-aware top padding via `useSafeAreaInsets()` and tab-aware bottom padding via `lib/navigationChrome.ts`, accounting for notched iPhones, the tab bar, and the home indicator.
- Profile Spotify Free/Premium markers use ink/paper editorial styling. Do not use Spotify green for Profile badges; reserve Spotify green for Spotify-branded sign-in/opening UI.
- The Profile hero avatar is square (`Avatar` `rounded={false}`) to match the press grid. `Avatar` defaults to `rounded` so other call sites are unaffected.
- The Spotify Free explainer callout on the album surface uses ink border + `paperAlt` background with a small "Spotify Free" mono label — not a green-bordered box. The green is reserved for the Spotify-branded sign-in/open button only.
- The sign-in screen (`EditorialSignInView`) is safe-area-aware via `useSafeAreaInsets()` (top + 28 / bottom + 28); do not revert to a fixed `py-10` that collides with the notch/home indicator. The Spotify sign-in button is square (no `rounded-full`) with mono-bold uppercase label to match the skin, keeping Spotify green.
- Taste map artist names should wrap cleanly, generally up to two lines, with stable rank/count alignment. Decade data should keep visible text counts and an editorial ruled/shelf feel, not a bare utility progress bar.
- Listening summary should use the five emotional rating labels when summarizing mood. Avoid overemphasizing numeric averages.
- `EditorialActionButton` (in `components/skins/editorial/EditorialActionButton.tsx`) preserves its provided `title` while loading, so callers should pass specific loading copy such as `Syncing...`, `Retrying...`, or `Saving...`. Its disabled state keeps the resting palette at reduced opacity and never inverts.
- Country chip renders only when `album_artist_country` is present; `GB` displays as `UK`. Hide the chip when country is null.
- The spec line should not add genres. The product does not explain picks by genre.
- The subscription run / `VOL.` streak surface is client-derived by `lib/streak.ts` from `useDiscoveries()` `pick_date` values plus `overview.streak`. It operates on the pick's local `YYYY-MM-DD` calendar date strings and must not introduce UTC day-boundary conversions. Home renders a compact standing-order strip below the ballot and before any archive nudge; Profile renders the expanded strip in the identity/stat area. Copy stays gentle and low-pressure.
- Do not use negative `letterSpacing`. It causes text clipping at large accessibility text sizes. Positive tracking values (0.8, 1.2, etc.) for mono/kicker labels are intentional editorial tracking.
- Flowing accent is scarce: masthead `day`, hairline rules, and CTA arrow. Do not animate album titles, metadata, rows, body copy, skeletons, errors, or lists.

Font contracts:

- Fonts are loaded in `theme/skins/fonts.ts` and gated in `app/_layout.tsx`.
- Use named NativeWind utilities from `tailwind.config.js`: `font-display`, `font-display-semibold`, `font-mono`, `font-mono-bold`, `font-prose`, `font-prose-medium`, `font-prose-bold`.
- Never use arbitrary classes like `font-[Archivo_800ExtraBold]`. NativeWind/Tailwind can compile those as `font-weight`, not `font-family`.
- If `tailwind.config.js` changes, clear Metro cache with `npx expo start -c`.

Motion/accessibility contracts:

- `AccentFlowProvider` owns one shared Reanimated progress value, gated by focused screen, app active state, and Reduce Motion.
- `lib/motion.ts`, `useReduceMotion`, and `lib/haptics.ts` must keep parallax, shimmer, entrance animations, and haptics respectful of Reduce Motion.
- `components/ui/Text` allows system font scaling by default. Only opt out for specialized animated/masked text where scaling would break rendering; do not disable scaling for ordinary Profile/body text.
- Large fixed-size editorial mastheads (e.g. "Colophon", "Archive", the Home title, the "your album of the day" headline, profile display name) cap Dynamic Type via `maxFontSizeMultiplier` (~1.3–1.4) and, for single-line mastheads, `adjustsFontSizeToFit numberOfLines={1}`. This keeps them from overflowing at large accessibility text sizes without fully disabling scaling. The masked `AccentText` "day" stays `allowFontScaling={false}` by design, so a slight size divergence at extreme Dynamic Type is expected and acceptable.
- Haptics are best-effort and must never throw into a user action.
- FlatList entrance animations should run once per item key per app session; see `DiscoveryListItem`.
- iOS shadows need two layers when clipping rounded content: outer shadow view, inner `overflow-hidden` clip view.

NativeWind/third-party component contracts:

- Third-party components styled by `className` need `cssInterop`, for example `expo-image` `Image` and `MotiView` when styled directly.
- When using `MotiView` only for animation, put styling on inner views if that is cleaner.
- `components/ui/Button` takes `title`, not `label`, and supports variants `primary`, `accent`, `secondary`, `ghost`, `glass`, `loading`, and `haptic={false}`.
- Prefer `components/ui/*` primitives over direct raw React Native components in screens.

## Auth, Session, And Spotify Bootstrap

Supabase Auth in React Native:

- Uses AsyncStorage for persisted sessions.
- `lib/supabase.ts` may migrate legacy SecureStore session blobs once, but new session writes go to AsyncStorage.
- `detectSessionInUrl: false`, `flowType: 'pkce'`, and AppState-driven token auto-refresh are intentional.
- Keep ongoing SecureStore usage only for tiny best-effort flags.

Spotify OAuth:

- `lib/auth.ts` owns Spotify OAuth, callback completion, connection upsert, and sign-out bootstrap clearing.
- Callback parsing must accept OAuth params from both query strings and hash fragments.
- Dev logs may print callback param keys, never OAuth codes, provider tokens, access tokens, refresh tokens, or auth headers.
- Keep the explicit `albumoftheday://auth/callback` route and `app/auth/callback.tsx`.
- First-run signed-out users see the editorial `app/(onboarding)` Issue №0 flow before sign-in, gated by a best-effort SecureStore `onboarding_seen` flag. Returning or signed-in users skip it. The connect step reuses the shared Spotify sign-in/bootstrap handler from `SignInController`/`lib/auth.ts`; do not fork OAuth or duplicate `bootstrapSpotifySession`.
- `bootstrapSpotifySession(session)` must dedupe per user for the JS-context lifetime. Both sign-in and callback can resolve the same OAuth session; without dedupe the app can double-hit Spotify `/me` and trigger Development Mode 429 cascades.
- A failed bootstrap clears its dedupe entry so a retry is possible. `signOut()` clears all bootstrap dedupe state.
- Spotify scopes currently include `user-library-read`, `user-top-read`, `user-read-private`, and
  `user-read-email`. If Spotify returns `Unverified email with spotify`, verify the Spotify account
  email or test with a verified account.
- Spotify refresh tokens are not guaranteed on every OAuth login. Preserve the existing DB refresh token when `provider_refresh_token` is absent.
- `refresh-spotify-token` must tolerate an empty request body for authenticated user refreshes and derive `user_id` from JWT. Invalid JSON should return `400 invalid_json_body`.
- `upsert-streaming-connection` and `refresh-spotify-token` both use `verify_jwt=false`; keep their explicit CORS and Authorization/JWT validation if changing them.
- Auth must be established before the body is read. `refresh-spotify-token` parses the body only after the caller is known: a service request parses after the service-header check; a user request parses only after `getUser()` succeeds. Do not move parsing ahead of auth — an unauthenticated request must fail `401 missing_auth`/`invalid_user`, not leak a `400 invalid_json_body`. `upsert-streaming-connection` already validates the JWT before parsing; keep that order.

## Edge Function Request Body Parsing

Request-body parsing for functions with optional JSON bodies (`verify_jwt=false`, auth checked by hand) is centralized and fails closed:

- `supabase/functions/_shared/request-body.ts` exports `parseOptionalJsonBody(rawText)`. Empty/whitespace body → ok with `{}`; valid JSON object → ok; malformed JSON or valid-but-non-object JSON (number / string / boolean / array / `null`) → not ok. The non-object rejection matters: `JSON.parse('5')` would otherwise coerce to `{}` and silently run a default path. `refresh-spotify-token` and `upsert-streaming-connection` use it directly and return `400 invalid_json_body` when not ok.
- `supabase/functions/_shared/sync-request.ts` exports `parseSyncBody(rawText)` for `sync-spotify-library`. It builds on `parseOptionalJsonBody` and adds mode validation: empty body → ok (mode defaults to `initial` downstream); malformed/non-object → `invalid_json_body`; unknown `mode` → `invalid_sync_mode`; `initial`/`bounded`/`full_reconcile`/omitted → ok. A malformed body must never silently start an initial sync. Do not reintroduce the old `parsePayload` that swallowed `SyntaxError` into `{}`.
- Tests: `supabase/functions/_shared/request-body.test.ts` and `supabase/functions/_shared/sync-request.test.ts`.

## Library Sync

The library import is backend data for recommendations, not a visible Library tab.

Core files:

- `sync-spotify-library` Edge Function.
- `lib/library.ts`.
- `useLibrarySyncStatus`, `useTriggerLibrarySync`, `useLibraryStats`.
- `components/library/SyncBanner.tsx` and the editorial `SyncBanner`, shown only in Profile through the skin component set.

Modes:

- `initial` - after OAuth, fire-and-forget from the client, then server-side library import and ordered day-1 warm/compute.
- `bounded` - stale restore auto-sync, fetches limited pages, skips removal reconciliation, must still update `streaming_connections.last_synced_at`.
- `full_reconcile` - Profile/manual sync, may reconcile removals and trigger full follow-up work.

Guards:

- `AuthProvider` handles stale auto-sync after session restore, but only once per user per app session.
- `bootstrapSpotifySession` passes the device timezone into `triggerLibrarySync('initial')`; `sync-spotify-library` may persist `device_timezone` before downstream compute to avoid UTC day-1 races. Persist it only through the `set_profile_timezone_if_valid(p_user_id, p_timezone)` RPC, not by directly updating `profiles.timezone` from the function.
- Skip auto-sync while status is `queued` or `syncing`.
- Do not retry a failed sync inside the 60-minute failed retry cooldown.
- Avoid cascades in Spotify Development Mode. A bad auto-sync loop can 429 all Spotify API calls, including OAuth `/me`.
- `RouterGuard` shows `InitialSyncingScreen` only for the first-time missing-library state after sync status has loaded.
- Realtime channel names must be unique per hook instance. Use `useId()` in channel names.
- `ProfileController` passes the current `syncStatus` into `ProfileView`. The editorial `SyncBanner` accepts an optional `status` override so `app/skin-fixtures.tsx` can render syncing/failed states without starting a live subscription; when no override is provided it reads live status itself.
- Query invalidation must survive Realtime being unavailable (Expo Go firewall / dropped WebSocket). React Query `invalidateQueries` is prefix-match by default, so the passed key must be a true prefix of the active query key:
  - `useTriggerLibrarySync` reads `userId` from `useSession` and invalidates user-scoped keys (`['library-sync-status', userId]`, `['library-stats', userId]`, `PROFILE_OVERVIEW_KEY(userId)`). Do not regress to `PROFILE_OVERVIEW_KEY()` — `['profile-overview', undefined]` never matches the active `[..., userId]` query and silently leaves the overview stale offline.
  - `useLibrarySyncStatus` returns `refetch`; `ProfileController.handleRefresh` calls it so pull-to-refresh updates sync status without waiting for Realtime.
- Sync failure UI should use concise user-facing copy and keep raw backend `error_message` details out of the primary Profile surface. First-sync failure copy (in `EditorialInitialSyncingView`) must reference the on-screen retry button, not Profile (which is unreachable during first sync). Profile-context sync failure copy should not reference Profile either — the user is already there.
- Day-1 onboarding compute is ordered: after an `initial` sync completes, `sync-spotify-library` should call `prewarm-user-candidates` with `force: true`, wait for that result, resolve the current target date/timezone, then call `compute-album-of-the-day`. Do not revert this to parallel fire-and-forget prewarm and compute.
- The day-1 ordering is implemented in `supabase/functions/_shared/day1-onboarding.ts` (`runPrewarmStep`, `runComputeStep`, `day1OnboardingCompute`). `sync-spotify-library/index.ts` is a thin adapter that resolves `Day1Deps` from runtime env and delegates to it. Do not re-introduce inline orchestration in the entry point.
- `compute-album-of-the-day` can return HTTP 202 with `{ status: 'deferred', reason: 'day1_<x>' }` for any first-pick non-personal fallback when the user has enough library data (see Day-1 deferral below). Treat this by response body, not by `Response.ok`, because 202 is still `ok`.
- The day1 wrapper retries once after 15 s on any `day1_*` deferred reason, and stops if the retry also defers. The matcher is `body.reason.startsWith('day1_')` — do not regress to per-reason branching.

Critical DB write rule:

- Do not `.upsert()` partial progress patches to `library_sync_status`. Postgres checks NOT NULL constraints before `ON CONFLICT`. Use create/upsert only with all required NOT NULL fields, then plain `.update().eq('user_id', userId)` for progress patches.

## Day-1 Deferral And Prewarm Gating

Day-1 onboarding has a stricter correctness bar than established users: a first-time user with enough library data must not receive a silent curated fallback as issue #1. Two pieces of code own this contract.

### `shouldDeferFirstPick` — pure deferral matrix

`supabase/functions/_shared/day1-deferral.ts` exports `shouldDeferFirstPick({ fallbackReason, existingPicks, aggregatedAlbumsCount, libraryCountThreshold? })`. Decision matrix:

| `fallbackReason` | `existingPicks === 0` | `aggregated_albums_count >= 10` | Result |
|---|---|---|---|
| `compute_timeout` / `no_candidates` / `spotify_search_failed` / `spotify_audio_unavailable` / `lastfm_unavailable` / `mb_timeout` / `unknown_error` | yes | yes | defer → `day1_<reason>` |
| `library_too_small` | yes | yes | defer → `day1_library_quality_issue` |
| `library_too_small` | yes | no | no defer (honest small-library fallback) |
| any | no | (any) | no defer (established user) |
| `null` / unknown | (any) | (any) | no defer (defensive) |

`library_too_small` defers only when `aggregated_albums_count >= 10` — with 10+ albums the issue is taste-extraction quality, not library size, so the user deserves a real pick. Established users and tiny-library users still get honest fallbacks during outages.

`compute-album-of-the-day` calls this helper in its catch block. Every `day1_*` reason is namespaced so the day1 wrapper can match any of them with `body.reason.startsWith('day1_')` instead of per-reason branching. Do not regress the matcher to a literal `day1_compute_timeout` check.

### `runPrewarmStep` — strict status validation

`supabase/functions/_shared/day1-onboarding.ts` exports `runPrewarmStep(deps, userId) -> PrewarmOutcome`. The per-user status from `prewarm-user-candidates` (`results[0].status`) is validated strictly:

- `warmed` / `partial` / `skipped` → `usable` (compute proceeds; `skipped` is honest and compute will produce its own `library_too_small` fallback if applicable)
- `failed` → `hard_failed` with `reason: item.reason ?? 'prewarm_failed'`
- any other string → `hard_failed` with `reason: 'prewarm_unexpected_status:<value>'`
- HTTP 5xx / network exception / malformed JSON / missing status → `hard_failed`

`prewarm-user-candidates` returns HTTP 200 even when an individual user's prewarm fails (the per-user catch at `prewarm-user-candidates/index.ts:138` puts `status: 'failed'` inside `results[0]`). The day-1 wrapper must NOT treat that as `usable` — otherwise Phase 2 silently regresses and compute runs without a warmed cache. The full server-side status set lives in that file: `warmed` / `partial` / `skipped` / `failed`.

Hard failures skip compute, log `prewarm_hard_failed reason=<...>`, and let the daily dispatcher retry on the next cron tick. Do not reintroduce the old "if `prewarmResult.status` is undefined, fall through" behavior.

A candidate-cache write failure inside `prewarmUser` must NOT become `failed`: it is downgraded to `partial` (`reason: 'cache_write_failed'`) so day-1 still treats prewarm as `usable` and compute serves its own fallback if the cache is thin. `writeCandidatesToCache` already absorbs a transient `23505` against the strict `(source_artist_key, spotify_album_id)` index with one re-read-and-retry before throwing.

Cron prewarm fairness: `prewarm-user-candidates` selects completed-sync users ordered by `library_sync_status.last_prewarmed_at` (nulls first, then `updated_at`), and stamps `last_prewarmed_at = now()` after each non-throwing user (warmed/partial/skipped) in cron mode. Do not revert to ordering by sync `updated_at` — that re-selects the same head users every tick and starves the tail once user count exceeds `limit_users`. A targeted single-user call (`payload.user_id`) does not stamp.

### Test coverage

- `supabase/functions/_shared/day1-deferral.test.ts` — pure-function tests for the entire matrix plus boundary cases (count 9 vs 10, `existingPicks` 0 vs 1, custom threshold, null reason, unknown reason, namespacing).
- `supabase/functions/sync-spotify-library/index.test.ts` — full integration harness with stubbed `fetchFn` (queue-driven `Response` specs), stubbed Supabase admin via the narrow `Day1Admin` structural type, and injected clock / sleep. Covers prewarm outcomes (warmed / partial / skipped / 500 / throws / malformed JSON / missing status / `failed` / unknown), compute outcomes (ok / deferred / retry-deferred / failed), context-resolve failure, timezone fallback, and retry matcher for non-`day1_` reasons.

The `Day1Admin` structural type is intentionally narrower than `SupabaseClient` so the test file does not have to instantiate the full client (which pulls in transitive npm deps that break Deno's resolver). Production `SupabaseClient` satisfies it; tests pass a stub.

## Supabase Database Contracts

General:

- Schema lives in `supabase/migrations/`.
- Regenerate types from the linked DB with `npm run db:types` after migrations are applied.
- Edge Functions use Deno and per-function `deno.json` import maps. They are excluded from app `tsconfig.json`.
- Functions that import npm/jsr deps (e.g. `@supabase/supabase-js`) keep a per-function `deno.lock` next to their `deno.json` so `deno check --frozen` resolves locally instead of falling back to the stale repo-root lock. `sync-spotify-library`, `compute-album-of-the-day`, `prewarm-user-candidates`, `refresh-spotify-token`, and `upsert-streaming-connection` each have one. If you add such a dep to a function lacking a local lock, generate it: `deno check --lock=supabase/functions/<fn>/deno.lock --config supabase/functions/<fn>/deno.json supabase/functions/<fn>/index.ts`.
- Never detach Supabase methods from the client object. Always call `supabase.rpc(...)`, `supabase.from(...)`, etc. inline. Detached methods lose `this` binding and can crash.
- When a new RPC is not yet in generated types, cast the RPC name and args through `never`, call inline, then assert the return shape.
- If changing the return table or signature of an existing Postgres function, `drop function ...` first. `create or replace function` cannot change return types.

Security/grants:

- PostgreSQL grants function `EXECUTE` to `PUBLIC` by default. Every migration that creates or replaces functions must explicitly revoke and then grant the intended roles.
- Service-only RPCs grant only `service_role`.
- Client RPCs grant `authenticated` only, never `anon`.
- `profiles` is client-readable for authenticated users. Client `UPDATE` is column-scoped to `display_name, avatar_url, preferred_push_time, onboarding_completed` — `timezone` is intentionally NOT in that grant (it is written only via `set_profile_timezone_if_valid`), and `created_at` is server-owned. Do not restore a blanket `grant update on profiles`.
- Service-role keys never go in the app or repo.
- `streaming_connections` contains tokens. Clients must not `SELECT` from it. Clients read only `streaming_connections_safe`.
- `user_library_active` and `streaming_connections_safe` intentionally use security-definer view behavior plus explicit `auth.uid() = user_id` filtering. Do not switch them to `security_invoker = true` unless you redesign base-table grants/RLS.
- Operational tables/views such as external API logs, circuit breakers, rate limits, shadow picks, discovery observability, and MB artist cache are service-role only.
- Operational health views, including `v1_fallback_health` and `v1_external_api_health`, are service-role only. Do not grant them to `anon` or `authenticated`.

Current client RPCs and shapes:

- `get_current_pick(p_user_id)` returns the shared `AlbumDiscovery` shape for today's local date, including rating fields and `album_artist_country`.
- `get_discoveries(p_user_id, p_limit default 365, p_offset default 0)` returns the same shape, newest first. The client currently relies on defaults and has no pagination UI.
- `get_discovery_detail(p_user_id, p_aotd_id)` returns one shared `AlbumDiscovery` row.
- `get_recap_months(p_user_id)` returns JSONB `[{ month, issues }]`, newest first, for months with at least one pick. Authenticated-only execute grant.
- `get_monthly_recap(p_user_id, p_month)` returns JSONB `{ month, issues_count, opened_count, rated_count, rating_spread, avg_score, top_finding, span_min, span_max }` for the requested month. It buckets by the pick's local `albums_of_the_day.date`, never `ratings.updated_at`, and has an authenticated-only execute grant. The client reads it through `lib/hooks/useMonthlyRecap.ts` keyed `['monthly-recap', userId, month]`; `lib/hooks/useRecapMonths.ts` uses `['recap-months', userId]`. Until DB types are regenerated, the new RPC calls cast name/args through `never`.
- `save_album_rating(p_user_id, p_aotd_id, p_score, p_comment)` is the only client write path for ratings.
- `get_profile_overview(p_user_id)` returns profile stats JSON for the Profile screen.
- `safe_profile_timezone(text)` is callable by authenticated users and service role.
- `set_profile_timezone_if_valid(p_user_id, p_timezone)` is callable by `authenticated` and `service_role`. It validates with `safe_profile_timezone` and writes only valid timezone strings to `profiles.timezone`. It carries an ownership guard: an authenticated caller may only target their own row (`auth.uid() = p_user_id`); the service role (sync, where `auth.uid()` is null) bypasses. It is the ONLY timezone write path — the client (`lib/profile.ts` `syncDeviceTimeZone`) calls it via `supabase.rpc(...)`, and `sync-spotify-library` calls it after JWT validation. Do not reintroduce a direct `profiles.timezone` update from the client.

Ratings:

- Authenticated clients should not insert/update `public.ratings` directly.
- `save_album_rating` validates ownership, trims empty comments to null, rejects comments longer than 2000 chars (`rating_comment_too_long`), forces `is_public=false`, upserts by `(user_id, album_id)`, and moves the AOTD row to `rated`.
- Keep `on conflict on constraint ratings_user_id_album_id_key`; plain `on conflict (user_id, album_id)` can be ambiguous in PL/pgSQL.

Albums of the day:

- Client updates are status-only and forward-only: `pending -> opened -> rated`, and direct `pending -> rated` is allowed when rating without opening Spotify.
- Recommendation fields are immutable from the client.
- `opened_at` is set/protected by DB trigger.
- Idempotency uses `ensure_recommendation_atomic` with `INSERT ... ON CONFLICT (user_id, date) DO NOTHING`; do not reintroduce check-then-insert.
- All user-scoped tables FK to `auth.users(id) ON DELETE CASCADE`, including `aotd_shadow_picks` (its original FK lacked the cascade and would block user deletion). Keep cascade on any new user-scoped table.
- `handle_new_user` inserts the profile with `ON CONFLICT (id) DO NOTHING` so a duplicate `auth.users` insert cannot abort signup.

## Recommendation Pipeline

The hot compute path should remain cache-first and bounded.

Core Edge Functions:

- `compute-album-of-the-day`
- `dispatch-daily-picks`
- `prewarm-album-cache`
- `prewarm-user-candidates`
- `sync-spotify-library`
- `refresh-spotify-token`
- `upsert-streaming-connection`

Auth surface:

- These functions have `verify_jwt=false` where configured in `supabase/config.toml`.
- Cron/service functions must handle `OPTIONS`, reject non-POST methods, require `CRON_SECRET`, and validate `Authorization` themselves.
- User-facing token functions must validate the caller's JWT manually when `verify_jwt=false`.

Candidate generation:

- `recommendation_candidates` is the main user-specific cache, service-role only.
- `compute-album-of-the-day` normally calls `loadCachedCandidates()` and aggregates by Spotify album ID before scoring.
- Live generation is bounded recovery only when the eligible cache pool is too small.
- Do not reintroduce broad Spotify Search in the hot path.
- Primary generation uses late Spotify binding: build a bounded text pool first, pre-score, then resolve only top K through `resolveSpotifyAlbumCached`.
- Use `resolveSpotifyAlbumCached`, not direct `searchAlbum`, in recommendation/prewarm paths.
- Spotify search no-match is not an API failure; thrown non-2xx/timeouts are failures.
- Repeat guard must exclude by Spotify album ID, MusicBrainz release group ID, and normalized artist+album key via `album-dedupe.ts`.
- Taste extraction must ignore low-signal pseudo-artists such as `Various Artists` and `Unknown`.

External API discipline:

- Use DB-backed `reserve_external_api_slot` for Spotify Search, MusicBrainz release-group search/artist lookup, Last.fm top albums, and bounded library paging.
- Use circuit breakers for high-risk endpoints. Spotify Search is fail-closed: 429/403/5xx/timeouts/network errors open/write cooldown.
- Two breaker reads: `get_external_api_circuit_state` (RPC, claims the single half-open probe lease — use right before making the actual probe request, e.g. `assertExternalApiCircuitAllows`) vs `peek_external_api_circuit_state` (read-only, claims nothing — use for "is this circuit usable" gating in compute/prewarm live-recovery). Do not use the claiming variant for a plain check; it burns the probe lease and delays the real probe by a cycle.
- All external-API advisory locks (rate limit + breaker) and `try_start_library_sync` hash on `hashtextextended(..., 0)` (int8). Do not reintroduce `hashtext()` (int4) — both share Postgres' advisory-lock key space and int4 keys can alias int8 keys.
- Spotify token refresh is reconciled via compare-and-swap: `persistRefreshedSpotifyToken` in `_shared/spotify.ts` writes conditioned on the stale `access_token`; on a lost race (0 rows) it adopts the concurrently-persisted token instead of clobbering it. `getValidSpotifyToken` and `refresh-spotify-token` both go through it. Do not revert to an unconditional update — Spotify rotates refresh tokens and a clobber triggers `invalid_grant` cascades.
- `spotifyFetch` in `_shared/spotify-extended.ts` intentionally caps 429 retries to one short retry.
- Never log raw Spotify URLs, auth headers, callback codes, or tokens.
- Log normalized endpoints such as `search_album`, `artist_albums`, `artist_get_top_albums`, `release_group_search`, `artist_lookup`, `paged_library_albums`, `paged_library_tracks`.
- `v1_external_api_health` and `v_discovery_pick_observability` are service-role operational surfaces. `v_discovery_pick_observability` reads `live_is_fallback` / `live_fallback_reason` from the `albums_of_the_day` columns, not from `selection_reason` JSON (the JSON only carries those keys on fallback picks, so reading it reported NULL for successful picks and skewed the fallback-share metric).
- `prune_external_api_request_log` owns log retention.

Release eligibility:

- Reject one-track singles, Spotify `compilation`, MusicBrainz `Single`, compilation/live/soundtrack/remix/DJ-mix release groups.
- Spotify labels many EPs as `album_type='single'`; allow only EP-like singles, currently at least 3 tracks or at least 10 minutes when duration is known.
- `is_prewarm_seed` means "verified by top charts and safe for curated fallback", not "created only by prewarm".

Scoring/current tuning:

- Live algorithm version remains 2.
- Shadow algorithm version is 3 and writes to `aotd_shadow_picks` best-effort only.
- Shadow compares deterministic argmax to argmax for the same pool; do not compare against sampled/MB-swapped served picks.
- Pool-relative popularity banding is used in shadow via the optional popularity profile parameter.
- Mainstream penalty applies only to `tier === 'adjacent_artist'`; known-artist new album, safe anchor, and deep discovery are exempt.
- `selection_reason` may include QA metadata such as `candidate_tier`, `popularity_bucket`, `candidate_origin`, `source_artist_count`, and `track_b_multipliers`. UI copy should still use human formatting.
- For a user's first AOTD, do not silently insert a curated fallback when there is enough imported library data, regardless of which non-personal reason triggered the fallback. The deferral policy and prewarm gating live in `supabase/functions/_shared/day1-deferral.ts` and `supabase/functions/_shared/day1-onboarding.ts`; the day1 retry matcher accepts any `day1_*` reason. Established users and tiny-library users may still receive fallback during outages.

Artist country chip:

- Migration `20260601120000_artist_country_chip.sql` adds `albums.artist_country`, `mb_artist_cache`, and updates read RPCs to return `album_artist_country`.
- Compute resolves artist country best-effort from MusicBrainz after chosen candidate validation via `getArtistCountryCached`.
- Endpoint is normalized as `artist_lookup`.
- Country lookup must fail open to null and must never fail or materially delay the pick.
- Existing albums may have null country until new compute runs or a one-off backfill is done.

Daily dispatch:

- `find_users_due_for_compute(p_lead_minutes default 60, p_catchup_minutes default 1440, p_first_pick_grace_minutes default 60)` is calendar-day based.
- The dispatcher should precompute tomorrow shortly before the user's local midnight and catch up during the current local day if needed.
- If today's local pick is missing, today wins over tomorrow precompute, even near midnight.
- Tomorrow precompute requires today's pick to exist and should respect the first-pick grace window so a brand-new user does not receive two picks within minutes.
- It should not dispatch users who already have an `albums_of_the_day` row for the target local date.
- Day-1 operational diagnostic views such as `v_day1_pick_diagnostics`, `v_rapid_double_pick`, and `v_late_night_picks` are service-role only. `v_late_night_picks` wraps `user_timezone_at_compute` in `safe_profile_timezone(...)` before `at time zone` so one row with a bad zone string cannot break the whole view.
- `dispatch-daily-picks` returns `failed_count` and `failed`, and uses HTTP 207 for partial failures.
- `net.http_post(...)` only returns a queue id; inspect `net._http_response` for the actual function result.
- Cron jobs are operational live state, not fully represented by migrations. Verify `cron.job` / `cron.job_run_details` before changing schedules.
- Prefer Supabase Vault `project_url` and `cron_secret` when updating cron commands. Do not hardcode secrets into `cron.job.command`.

## Home, Discoveries, Profile Contracts

Home:

- Reads today's pick through `useTodayPick()` and `get_current_pick`.
- `WaitingForPick` is only for a successful RPC response with no row for the user's local date.
- When sync is complete, the user has no discovered picks yet, and the imported library has enough albums, Home should use the first-pick "Building your first pick" state instead of generic brewing copy. This also covers day-1 deferral: when `compute-album-of-the-day` returns HTTP 202 `{ status: 'deferred', reason: 'day1_<x>' }`, the day1 wrapper retries once and the dispatcher catches up on the next cron tick if needed.
- Do not infer first-pick state from unrated-past-pick count. Use profile overview/discovered count or another explicit AOTD count.
- RPC/network failures must render retryable `PickError`, not waiting/brewing copy.
- Today's successful pick renders `AlbumDetail` directly and may include a footer nudge for old unrated picks. The nudge reads `useUnratedPastPickCount(pick.aotd_id)`, keyed `['unrated-past-pick-count', userId, excludeAotdId]`. After a rating, `useSaveRating` must invalidate via `UNRATED_PAST_PICK_COUNT_PREFIX(userId)` (2-element prefix), not `UNRATED_PAST_PICK_COUNT_KEY(userId)` — the latter is a 3-element key with `undefined` at index 2 and never partial-matches the active query, leaving the footer count stale when Realtime is down.
- Home passes `refreshing`/`onRefresh` (from `useTodayPick`) into `AlbumDetail` for pull-to-refresh.

Discoveries:

- `app/(tabs)/discoveries.tsx` renders `DiscoveriesController`.
- Filters are All / Waiting / Rated in the editorial skin. The `pending` filter value means not rated, so it includes both `pending` and `opened` rows.
- History detail lives at `app/discoveries/[aotdId].tsx` and uses `get_discovery_detail`.
- Monthly recap detail lives at `app/discoveries/recap/[month].tsx` and renders `RecapController` plus the editorial Monthly Review view. The editor's note uses the five emotional rating labels and never a numeric-average headline or genre taxonomy. Empty, partial (picks but no ratings), and full months must stay visually honest.
- Keep explicit error/retry states. Do not mask RPC/network failures as empty history or not found.
- The archive list `RefreshControl` reuses the controller's `retrying`/`onRetry` (the `useDiscoveries` refetch) for pull-to-refresh.

Profile:

- `ProfileController` owns profile, connection, overview, library stats, sync-now, sign-out, and product label.
- `get_profile_overview` aggregates stats server-side because user libraries can be large. Its `rated_this_month` count buckets by the user's local timezone (`updated_at at time zone <zone>` vs `now() at time zone <zone>`), not UTC, so it does not flip a day early/late at a month boundary.
- Profile renders as an editorial listening identity surface: hero identity, honest ledger loading, Taste map, Listening summary, then quieter operational sections.
- Profile shows library status and manual sync. `SyncBanner` should stay Profile-only and visually subordinate unless sync has failed or gone stale.
- The Taste map restores library span copy when `span_min` and `span_max` are available, wraps long artist names, and keeps decade counts readable in text.
- Listening summary should distinguish loading, empty, and rated states. Rated states summarize journal mood with emotional rating language derived from `avg_score`.
- Profile supports pull-to-refresh: `ProfileController` exposes `onRefresh` (fans out to profile, connection, overview, and `useLibrarySyncStatus` refetches) and `refreshing` (overview query). Library stats are read from the overview payload, so refetching overview refreshes them.
- When no Spotify connection row exists, the Connections section reads "No Spotify connection yet" (not "syncing").
- Push time and delete account are future work unless explicitly requested.

## Environment And Secrets

- App env reads go through `lib/env.ts` and `app.config.ts` `extra`.
- Do not read `process.env.*` directly in app code.
- Required public env names are in `.env.example`.
- Do not inspect or commit `.env*`, service-role keys, Spotify secrets, Supabase JWT secrets, or private credentials.
- Edge Functions read secrets from Deno env.

## Validation Checklist

For app/client changes:

- `npm run typecheck`
- `npm run lint`
- If NativeWind/font config changed, run/ask the user to run `npx expo start -c`.
- For visual changes, verify on device or with local fixture screens such as `app/skin-fixtures.tsx` when appropriate.
- `app/skin-fixtures.tsx` includes Profile fixture scenarios for rich identity, empty/low data, syncing, and failed/free-account states. Keep these fixtures updated when changing Profile layout, copy, or sync presentation.

For Supabase migrations:

- Review grants and RLS explicitly.
- Drop/recreate functions when return shapes change.
- After migrations apply: `npm run db:types`.
- Re-check any client RPC casts through `never` after regenerated types.

For Edge Functions/shared recommendation logic:

- Run targeted Deno tests for touched modules.
- For deploy-bound Edge Function changes, run `deno check --frozen` on touched function entrypoints when practical; app `tsc` excludes Supabase functions.
- Check method/CORS/auth handling.
- Check external API logging/rate-limit/circuit-breaker behavior.
- Keep primary compute within its budget and fail to fallback gracefully.

For OAuth/sync changes:

- Test sign-in, explicit callback, restored session, sign-out then sign-in.
- Confirm bootstrap dedupe is preserved.
- Confirm initial/bounded/full sync mode semantics.
- Confirm day-1 ordered prewarm/compute and deferred retry behavior, including the strict prewarm `status` validation (`warmed` / `partial` / `skipped` are usable; `failed` and unknown statuses are `hard_failed`).
- Confirm device timezone is passed/persisted before day-1 compute when available.
- Run the regression suites: `deno test --allow-env supabase/functions/_shared/day1-deferral.test.ts supabase/functions/sync-spotify-library/index.test.ts`.
- For token-refresh / candidate-cache changes also run `deno test --allow-env --allow-net supabase/functions/_shared/spotify-token-persist.test.ts supabase/functions/_shared/candidate-cache.test.ts`. `spotify-token-persist.test.ts` covers the CAS reconcile in `persistRefreshedSpotifyToken` (win / lost-race adopt / update error / read error / no-guard); `candidate-cache.test.ts` covers the `writeCandidatesToCache` 23505 single re-prepare+retry. `--allow-net` is needed only because the best-effort `/me` product fetch is stubbed at the global-fetch level.
- Watch for Spotify Development Mode 429 cascades.

For album detail/share/rating changes:

- Test open in Spotify native and web fallback.
- Confirm Free Spotify explainer is awaited before open.
- Test share card with slow/missing cover.
- Test all five rating labels and the one-time rating microcopy.
- Confirm ratings do not influence scoring code.

## Plans

Use plans as scoped context, not automatic instructions. Relevant current plans:

- `plans/editorial-redesign-final.md` - current UI direction and final editorial details.
- `plans/2026-06-11-editorial-visual-polish.md` - shipped editorial polish pass: design tokens, pressed ink/paper inversion, cover plate/crop marks, paper grain, initial cap, rated stamp, archive month grouping, profile ledger, share-card barcode.
- `plans/editorial-font-fix.md` - why named font utilities are mandatory.
- `plans/artist-country-chip.md` - country chip data plan and limitations.
- `plans/discovery-improvements-v2.1.md` - familiar catalog, pool-relative shadow mode, scoring decisions.
- `plans/safe-discovery-observability-plan.md` - service-role-only recommendation observability.
- `plans/api-request-optimization-plan.md` - external API caching, breakers, limiters, bounded sync.
- `plans/day-1-onboarding-pick-remediation-plan.md` - canonical day-1 reference (phases 1–9): first-login pick, late-night dispatch, generalized deferral, prewarm failure hardening, regression tests.
- `plans/discoveries-pivot.md` - why Library/Friends/Stats tabs are gone from v1.
- `plans/profile-screen-design-remediation-plan.md` - Profile editorial identity, safe-area/loading/accessibility, taste/listening hierarchy, badges, sync copy, and fixture requirements.
- `plans/comprehensive-debug-audit-remediation-plan.md` - audit-originated follow-up; Phases 1, 3–6 shipped (incl. Phase 6 dependency hygiene: postcss override shipped, uuid accepted as unexploitable), Phase 2 (Day-1 recommendation correctness) in progress.
- `plans/v2-social.md` - deferred social scope.

Older phase plans can be useful for intent, but the current code and this guide win when they conflict.
