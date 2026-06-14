# Editorial Design Overhaul — "The Daily Issue"

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (with review checkpoints) or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a **large, multi-phase** plan; each phase is independently shippable. Do **not** try to land all phases in one branch.

**Status:** Approved direction, not yet started. Authored 2026-06-14.

**Owner decisions (locked):**
- **Hero = Hybrid.** Keep the shipped cover-plate + crop-marks album surface. Do **not** go full-bleed. Elevate it with a masthead running-head, a sharper type scale, and Night Edition support.
- **Periodical metaphor = Selective.** Use the "issue / subscriber / volume / standing order" language where it adds delight (onboarding, recap, streak, share). Keep the core daily/album/archive/profile copy calm and human. Do **not** rename existing product copy wholesale.
- **Scope = Polish + new surfaces + selected bold bets.** All four new surfaces are in (onboarding, recap, streak, share variants). Night Edition is in. Skia/Lottie motion is in.
- **Structure = Phases A → B → C.** Owner can stop after any phase. A is safe polish, B is new surfaces, C is the bold bets.

---

## 0. Read first

This plan **must not** be executed without re-reading `AGENTS.md`. It changes several shipped contracts documented there. Every contract this plan changes is listed in **§7 AGENTS.md updates required** — the implementing agent updates `AGENTS.md` in the same PR that lands the behavior, or the docs drift.

Source-of-truth order (from `AGENTS.md`): current code/migrations → `AGENTS.md` → fresh plan files (this one) → older plans → README. When this plan conflicts with shipped code, re-confirm against code before proceeding.

### Visual references (mockups produced during design)

The implementing agent will not see the brainstorming mockups. They depicted:
1. **Hero Day vs Night** — running-head masthead (`ALBUM OF THE DAY` left, `№ 412` coral right, hairline rule under), coral `SAT 14` date tab on the cover, cover-plate, overprinted title, spec line, `WHY THIS ONE?` heavy rule with raised initial cap, ink CTA with coral top-stripe + play triangle, 5-cell `EDITORIAL BALLOT` (cell `05` = loved, coral-filled). Night = inverted: near-black warm paper `#17120f`, bone ink `#f0e6d8`, brighter coral `#ff5a3c`, CTA inverts to bone bar with dark label.
2. **New surfaces** — Onboarding `ISSUE №0` (subscribe framing, green `CONNECT SPOTIFY`), Monthly `THE MONTHLY REVIEW` (two stat cells, `RATING SPREAD` bar chart, `TOP FINDING` row, `EDITOR'S NOTE` drop-cap block), Streak `THE STANDING ORDER` (`VOL. XII`, a printer's run of issue spines, a 7×N month-ledger dot grid, `DON'T BREAK THE RUN`).
3. **Archive + Colophon** — archive rows gain 36px cover thumbnails + a coral-bordered rating stamp or `WAITING` tag, month headers with 2px rule; Profile keeps `COLOPHON` masthead but gains a subscriber identity block (square avatar, `SUBSCRIBER SINCE`, coral `VOL. XII` chip), a 3-cell printed stat strip, taste ledger, decade shelf, mood line.
4. **Share variants** — story 9:16 (full-bleed cover + overprint + barcode), square 1:1 (cover plate + stamp + colophon), minimal ticket (double ink frame, big coral `№ 412`, `RATED 05` stamp, barcode — no cover).

### Design tokens already shipped (reuse, do not reinvent)

From `components/skins/shared/skinStyles.ts`: `editorialColors` (paper `#f4ebe0`, paperAlt `#eadcc9`, ink `#1d1511`, muted `#6f5d52`, accent/accentStatic `#ff4a2e`, red `#9f2637`), `accentFlow`, `ratingTone`, `space` (s1–s8 4pt scale), `tracking` (label 0.8 / micro 1.0 / kicker 1.4), `ruleWeight` (hairline 1 / rule 2 / heavy 3), `editorialType`, `zIndex`, `touchTarget`. Font utilities from `tailwind.config.js`: `font-display`, `font-display-semibold`, `font-mono`, `font-mono-bold`, `font-prose`, `font-prose-medium`, `font-prose-bold`. **Never** use arbitrary `font-[...]` classes or negative `letterSpacing`.

---

## 1. Concept: the periodical system

The product already speaks editorial. This overhaul makes it a **coherent periodical** instead of a set of independently-styled screens. Four systems carry that:

1. **Masthead system** — a single reusable running-head (`EditorialMasthead`) at the top of the main scroll surfaces: publication wordmark + issue № + date + a hairline/2px rule. One component, themeable, used on Home, Archive, Profile, Recap. This is the connective tissue that makes the app read as one publication.
2. **Issue identity** — each daily pick is "Issue №N" (N = `issueNo(album)`, already exists at `index.tsx:83`). Streak becomes "Vol." (roman). These appear selectively, never forced onto body copy.
3. **Two editions** — Day (warm paper) and **Night Edition** (evening palette). A real palette layer, not a CSS hack, with a Profile toggle and optional system-preference follow.
4. **Press motion** — letterpress ink-press on bordered controls, a halftone/risograph cover treatment (Skia), ink-bleed reveals, and a page-turn between issues. All Reduce-Motion gated.

**Non-negotiable invariants preserved** (from `AGENTS.md` Product Invariants): English-only copy, tabs stay Home/Discoveries/Profile, no skip mechanic, five rating labels, ratings are private and not recommendation input, "Why this album?" mandatory, no genre taxonomy in copy, Spotify green reserved for Spotify-branded UI, share stays file-first PNG, flowing accent stays scarce.

---

## 2. Dependency & infrastructure prep (do before Phase C; safe to do up front)

These require the **user** to run install commands (sandbox blocks `npm install`). The implementing agent must surface these as manual steps, not run them silently.

- **Skia + Lottie** (Phase C): `npx expo install @shopify/react-native-skia lottie-react-native`. If peer conflicts appear, fall back to `npm install @shopify/react-native-skia lottie-react-native --legacy-peer-deps` then `npx expo install --check`. Confirm versions are Expo SDK 54-compatible against the user's installed Expo Go supported SDK (per `AGENTS.md` dependency rules). `react-native-worklets` is already present (Reanimated 4).
- **Metro cache**: after any `tailwind.config.js` change, run `npx expo start -c`.
- Keep `react`/`react-native` pinned exact. Always `--legacy-peer-deps`.

Phases A and B need **no new dependencies**. If the owner stops before C, nothing above is required.

---

## 3. Phase A — Foundations & polish (no new deps, mostly presentation)

Goal: make the current app feel intentionally *published*, and prepare the codebase for B/C. Ships on its own.

### A0. Split the `editorial/index.tsx` monolith (groundwork)

`components/skins/editorial/index.tsx` is ~1780 lines and holds every view, state, share card, and helper. Every later task edits it; leaving it monolithic makes B/C error-prone and hard to review.

- [ ] Extract per-surface view files under `components/skins/editorial/views/`: `AlbumDetailView.tsx`, `DiscoveriesView.tsx`, `ProfileView.tsx`, `SignInView.tsx`, `InitialSyncingView.tsx`, `ShareCard.tsx`, plus `states.tsx` (empty/error/skeletons) and `RatingEditor.tsx`.
- [ ] Keep small shared helpers (`formatIssueDate`, `issueNo`, `albumSpec`, `albumCoverMarkers`, `monthLabel`, `buildArchiveItems`) in `components/skins/editorial/lib.ts`.
- [ ] `index.tsx` becomes the registry/barrel that assembles the `SkinComponentSet` from the extracted views. No behavior change.
- [ ] Validation: `rtk tsc && rtk lint`. Visual: every `app/skin-fixtures.tsx` scenario renders identically. This task must be **pure refactor** — a reviewer should see zero pixel change. Commit separately before any visual work.

### A1. `EditorialMasthead` running-head

- [ ] Create `components/skins/editorial/EditorialMasthead.tsx`: props `{ issueLabel?: string; dateLabel?: string; rule?: keyof typeof ruleWeight }`. Renders the publication wordmark (`ALBUM OF THE DAY`, `font-mono-bold`, `tracking.label`), the issue/date aside (`font-mono`, muted, coral № if provided), and a rule. Respect `maxFontSizeMultiplier` (~1.3) and safe-area top inset where it sits.
- [ ] Mount on Home (above the existing kicker — reconcile so we don't double up the `№/date` line; the masthead replaces the standalone kicker on Home), Archive (above `THE ARCHIVE` masthead title), and Profile (above `COLOPHON`). The big display titles (`your album of the day`, `Archive`/`THE ARCHIVE`, `Colophon`) stay — the masthead is a *thin* running-head above them.
- [ ] Theme-ready: read colors from a palette object (in A it can read `editorialColors` directly; C swaps it to the palette hook — keep the color access in one place per component to make C a small diff).
- [ ] Validation: `rtk tsc && rtk lint` + device. Confirm Dynamic Type at ~1.4 doesn't overflow the running head; it should `numberOfLines={1}` with `adjustsFontSizeToFit` where single-line.

### A2. Typographic elevation

- [ ] Audit the `editorialType` scale and Home hero. Tighten the hero: the album title (`display34`) and `your album of the day` headline should feel like a cover headline — verify line-height vs font-size doesn't clip descenders on Android (bump `display34.lineHeight` to 34 if needed, per the prior polish plan's open risk).
- [ ] Spec line (`EditorialSpecLine`) refinement: ensure it reads as a printed colophon line (year · label · tracks · runtime · country), consistent separators, mono micro tracking. No genres (invariant).
- [ ] Confirm the raised initial cap (`ReasonParagraph`) renders cleanly; if iOS nested-Text stretches the first line, drop cap to 24/24 (prior known risk).
- [ ] Validation: `rtk tsc && rtk lint` + Dynamic Type sweep.

### A3. Micro-interaction polish (non-Skia; Skia upgrades land in C2)

- [ ] **Ballot selection**: when a rating cell is chosen, animate the ink-fill with a short Reanimated transition (scale/opacity press + fill), Reduce-Motion gated. Keep the persisted `EditorialStamp` ("Rated 0X") behavior. Accessibility: rows keep the accessible selected state; animation is decorative.
- [ ] **Haptic choreography**: confirm `lib/haptics.ts` fires on ballot select, CTA press, filter switch, refresh — best-effort, never throws (invariant).
- [ ] **Letterpress press**: the existing pressed ink↔paper inversion (local `useState` + `onPressIn/Out`) stays. In A, add a subtle scale(0.98) press to `EditorialActionButton` and the big CTA, Reduce-Motion gated. (Skia ink-spread is C2.)
- [ ] Validation: `rtk tsc && rtk lint` + Reduce Motion on/off device check.

### A4. Archive rows → back issues with thumbnails

- [ ] In `DiscoveriesView` / `EditorialDiscoveryRow`: add a 36–40px cover thumbnail (core RN `Image` or `CoverImage`) at the row leading edge, then issue №, title, artist; trailing = the rating stamp (coral-bordered `0X`) for rated rows or a `WAITING` mono tag for unrated. Keep month grouping (`buildArchiveItems`), the 2px month rule, and the first-row-drops-top-border behavior.
- [ ] Keep keys (`month-<label>` / `aotd_id`), entrance animation (once per key per session), and `RefreshControl` wiring.
- [ ] Handle missing covers gracefully (paperAlt block, no broken image).
- [ ] Validation: `rtk tsc && rtk lint` + device; check large Dynamic Type doesn't break the row grid; empty/skeleton states unchanged.

### A5. Profile → subscriber identity

- [ ] Add to the identity block: `SUBSCRIBER SINCE <month year>` (derive from earliest discovery or profile `created_at` if exposed; if not available client-side, use the earliest `pick_date` from discoveries or omit — do **not** invent a value), and a coral `VOL. <roman streak>` chip. Keep the square avatar (`rounded={false}`) and honest loading (no placeholder zeros while `overviewLoading`).
- [ ] Restyle the three stats (streak/issues/rated) as a single printed **stat strip** (bordered box with two interior dividers) instead of separate `LedgerStat` cards — matches the mockup. Keep skeleton loading.
- [ ] Keep Taste map ledger, decade shelf, listening mood line, connections, log out — quieter hierarchy preserved (invariant: identity > taste > listening > operational).
- [ ] Validation: `rtk tsc && rtk lint`; update `app/skin-fixtures.tsx` Profile scenarios (rich/empty/syncing/failed) if layout shifts.

### A6. State pass (empty / error / loading)

- [ ] Sweep `EditorialEmptyState`, `EditorialErrorState`, skeletons, `WaitingForPick`, first-pick "Building your first pick", and sync banners for consistent editorial treatment (paper, rules, mono labels). Keep honest-failure rules: RPC/network failures render retryable errors, never waiting/brewing copy (invariant).
- [ ] Validation: `rtk tsc && rtk lint` + fixtures.

**Phase A exit:** `make check` clean, all fixtures verified on device, `AGENTS.md` updated for masthead + archive-thumbnail + profile-identity contracts.

---

## 4. Phase B — New surfaces

Each is independently shippable. B1–B3 need no backend; B4 needs a migration + RPC.

### B1. Onboarding — "Issue №0 / Subscribe"

A short editorial first-run that precedes the Spotify connect. Selective periodical language is welcome here.

- [ ] New route group `app/(onboarding)/` (or a pager inside the sign-in flow). Route file thin; behavior in a shared controller `components/skins/shared/OnboardingController.tsx`; presentation in `components/skins/editorial/views/OnboardingView.tsx`.
- [ ] 3 beats: (1) masthead reveal "A daily music periodical / Issue №0", (2) the ritual explained ("one album a day, in your own time — your ratings are a private journal, they don't tune tomorrow's pick" — reinforces the rating invariant up front), (3) connect = the existing Spotify green `CONNECT SPOTIFY` button which hands off to the current OAuth flow in `lib/auth.ts`. Do **not** fork OAuth; reuse `SignInController`'s sign-in handler.
- [ ] Gate: show only when not previously seen. Persist a best-effort `onboarding_seen` flag via SecureStore (per `AGENTS.md`: SecureStore is for tiny best-effort flags). Returning/signed-in users skip. Keep the existing sign-in screen reachable as the connect step.
- [ ] Safe-area aware (`useSafeAreaInsets`), Reduce-Motion aware, paper grain mounted.
- [ ] Validation: `rtk tsc && rtk lint`; test sign-in, callback, restored session, sign-out→sign-in still work (per `AGENTS.md` OAuth checklist); confirm onboarding doesn't re-show after completion.

### B2. Streak — "Subscription Run / Volume"

Mostly client-derived; no backend if discoveries data suffices.

- [ ] A streak module: a printer's-run of issue spines (consecutive days) + a month-ledger dot grid (read vs not). Derive from `useDiscoveries()` (`pick_date`, `status`) and `overview.streak`. Compute consecutive-day run client-side in `lib/streak.ts` (pure, unit-testable) using the user's local dates — reuse the timezone handling already used for picks; do not introduce a UTC day boundary.
- [ ] Placement: a compact streak strip on Home (above the footer nudge, below the ballot) **and** an expanded version in Profile's identity area. Keep Home's flowing-accent scarcity — the run uses static ink with a single coral "today" spine.
- [ ] Copy: "Vol. <roman>", "<n>-day run", gentle "don't break the run" microcopy — never punitive, never a hard streak-loss alarm (the product is low-pressure; ratings/skip invariants imply a calm tone).
- [ ] Reduce-Motion: spines/dots are static; any fill-in animation is gated.
- [ ] Validation: `rtk tsc && rtk lint`; add `lib/streak.test.ts` (or Deno/jest per existing infra) for the run computation across month/timezone boundaries; device check.

### B3. Share variants — story / square / minimal

Keep the **file-first PNG** mechanism (invariant): `react-native-view-shot` capture of an off-screen `ShareCard` backed by core RN `Image` (not `expo-image`), cover prefetch, RN `Share.share` on iOS / `expo-sharing` elsewhere.

- [ ] Refactor `ShareCard` into a format-parameterized component: `format: 'square' | 'story' | 'minimal'`. Square = current refined card (cover plate + colophon + barcode). Story = 9:16 full-bleed cover + overprinted masthead/title + barcode footer. Minimal = text-only ticket (double ink frame, big coral №, `RATED 0X` stamp, barcode, url) for fast shares / missing cover.
- [ ] Each format renders its own off-screen capture target at the correct aspect/size. Keep the deterministic `barcodeWidths(seed)` and `issueNo` colophon. Story/square bake paper grain (opacity ~0.06); the minimal ticket may skip grain.
- [ ] UX: a small format picker in the share affordance (default square = current behavior, so the existing one-tap share still works). Picker is editorial (segmented ink/paper), not a system sheet.
- [ ] Edge cases (per `AGENTS.md` share checklist): slow/missing cover (minimal is the safe fallback), long album/artist names (clamp), long URLs.
- [ ] Validation: `rtk tsc && rtk lint`; capture each format with a slow/missing cover on device; confirm RN `Share.share` path on iOS unchanged.

### B4. Monthly Recap — "The Monthly Review" (needs backend)

> **Deepened in `plans/2026-06-14-monthly-recap-backend.md`** — full RPC SQL (`get_monthly_recap`, `get_recap_months`), grants, query hooks, and screen wiring live there. The summary below stays for context; execute from the sub-plan.

The largest B task. A per-month editorial spread: issue/rated counts, rating spread, top finding, library/mood note.

**Backend:**
- [ ] New migration `supabase/migrations/<ts>_monthly_recap_rpc.sql` adding `get_monthly_recap(p_user_id uuid, p_month date)` returning JSON: `{ month, issues_count, rated_count, rating_spread: {1..5 counts}, top_finding: <AlbumDiscovery-ish>, avg_score, mood_label_inputs, span_min, span_max }`. Aggregate server-side (libraries are large — mirror `get_profile_overview`'s rationale). Bucket by the user's **local** timezone at the month boundary (mirror `get_profile_overview.rated_this_month` which uses `updated_at at time zone <zone>` — do not regress to UTC).
- [ ] Grants: `revoke ... from public`, `grant execute ... to authenticated` only (client RPC; never `anon`, never service-role-only). If changing an existing function signature later, `drop function` first.
- [ ] After apply: **manual steps** — `supabase db push` then `npm run db:types`; re-check any `never`-cast RPC call after types regenerate.

**Client:**
- [ ] `lib/recap.ts` query hook `useMonthlyRecap(month)` keyed `['monthly-recap', userId, month]`. Cast the new RPC name/args through `never` until types regenerate, then assert the return shape (per `AGENTS.md` RPC convention). Call `supabase.rpc(...)` inline (never detach).
- [ ] Route `app/discoveries/recap/[month].tsx` (or a Profile entry) → `RecapController` → `components/skins/editorial/views/RecapView.tsx`. Editorial spread per mockup: `THE MONTHLY REVIEW` masthead, two stat cells, `RATING SPREAD` bar chart (5 bars, static ink + one coral peak), `TOP FINDING` row (cover + title + stamp, taps into discovery detail), `EDITOR'S NOTE` (a short generated-from-data sentence using the five emotional labels, not numeric averages — invariant).
- [ ] Entry points: a "This month in review" card in Profile and/or an archive month-header affordance. Empty/low-data and loading states must be honest (no zero-metric placeholders before data loads).
- [ ] Validation: `rtk tsc && rtk lint`; targeted Deno test for the RPC's month-bucketing if added under `supabase/functions` test infra, or a SQL-level sanity check; device check for empty month, single-pick month, full month.

**Phase B exit:** each surface verified; `AGENTS.md` updated (new routes, new RPC + grants, share-variant contract); fixtures added for onboarding/recap/streak where practical.

---

## 5. Phase C — Bold bets

### C1. Night Edition (evening palette + toggle)

> **Deepened in `plans/2026-06-14-night-edition.md`** — palette/provider/hook architecture, the per-file migration phases (N1–N5), the ShareCard-captures-Day rule, and the NativeWind residue handling live there. Key finding: editorial color is applied inline (not via Tailwind color classes), so this is a source swap, not a class rewrite. Execute from the sub-plan.

The largest single workstream. `editorialColors` is currently a static export consumed across many files; Night Edition needs a real theme layer.

**Architecture:**
- [ ] Define two palettes in `skinStyles.ts`: `dayPalette` (current `editorialColors`) and `nightPalette` (paper `#17120f`, paperAlt `#211a15`, ink `#f0e6d8`, muted `#9a8a7a`, accent/accentStatic `#ff5a3c`, red `#c2566a` or tuned, rule = ink). Keep `editorialColors` exported as the day palette for back-compat during migration.
- [ ] `EditorialThemeProvider` + `useEditorialPalette()` hook (in `theme/skins/` next to the registry). Provider holds `edition: 'day' | 'night' | 'system'`, resolves the active palette, and exposes a setter. Persist the choice (AsyncStorage; SecureStore is only for tiny flags — a theme preference can live in AsyncStorage). `system` follows `useColorScheme()`.
- [ ] Migrate editorial components to read palette from `useEditorialPalette()` instead of the static import. Do this **incrementally per file** (A0's split makes this tractable): each commit migrates one view and is independently verifiable. NativeWind class-level colors that encode ink/paper must also flip — prefer inline `style={{ color: palette.ink }}` over hardcoded classes for surfaces that invert, or drive a small set of CSS-var-like tokens. **Beware**: the share card PNG must capture in the **current** edition (or always Day for legibility — decide and document; recommendation: capture Day for shareability regardless of in-app edition, since shared images live outside the app's dark context).
- [ ] Paper grain over night paper: verify opacity reads at 0.05–0.06 on dark; tune if needed.
- [ ] Toggle UI: a Profile control styled as choosing an **edition** ("Day edition / Night edition / Follow system"), ink/paper segmented, not a generic switch. Spotify green stays green in both editions.
- [ ] Accessibility: contrast-check every text/background pair in night (WCAG AA for body). Reduce Motion unaffected. Dynamic Type unaffected.
- [ ] Validation: `make check`; sweep **all** screens + fixtures in both editions + `system`; verify no element stays "half-inverted" (the classic theme bug); verify share capture edition decision.

> Night Edition is split into phases N1–N5 in `plans/2026-06-14-night-edition.md`. Keep night non-default until every surface is migrated (N3); ship the toggle (N4) only after. Do not leave the app half-migrated with night as default.

### C2. Skia press motion

- [ ] **Halftone / risograph cover treatment**: a Skia overlay/shader on the album cover plate giving a subtle printed-dot/riso feel. Must be a *static* render by default (Reduce Motion and perf), with an optional one-time settle animation on load. Never block the cover from rendering if Skia fails — fall back to the plain `CoverImage`.
- [ ] **Ink-press buttons**: upgrade the letterpress press (A3) to a Skia ink-spread on `onPressIn` for the big CTA and `EditorialActionButton`. Reduce-Motion → instant inversion (current behavior).
- [ ] **Ink-bleed reveals**: optional entrance for the hero title / masthead rule on Home focus, gated by `AccentFlowProvider`'s focus/active/Reduce-Motion logic. Keep flowing-accent scarcity (masthead `day`, rules, CTA arrow only — do not animate body/lists/rows).
- [ ] Validation: `rtk tsc && rtk lint`; device perf check (no dropped frames on the Home scroll); Reduce Motion fully static; low-end device fallback.

### C3. Page-turn between issues (optional, lowest priority)

- [ ] A shared-element / page-turn transition when opening a discovery from the archive and when navigating issue→issue. Use Reanimated layout/shared transitions (the `+Reanimated layout` budget) and/or Skia. Preserve the navigation contracts: discovery detail uses `goBackToDiscoveries()` (native `back()` when possible), the root `Stack` (not `Slot`) requirement, and list scroll-position preservation. Do **not** regress those.
- [ ] Validation: `rtk tsc && rtk lint`; device; verify iOS edge-swipe back still works and Discoveries tab back-target is correct.

**Phase C exit:** `make check`; full device sweep in both editions with Reduce Motion on/off; perf validated; `AGENTS.md` updated (theme provider replaces "static palette source of truth", Skia/Lottie deps, motion contracts).

---

## 6. Cross-cutting requirements (every phase)

- **Accessibility**: respect Reduce Motion (`useReduceMotion`, `AccentFlowProvider`), allow Dynamic Type (cap large mastheads with `maxFontSizeMultiplier` ~1.3–1.4 + `adjustsFontSizeToFit numberOfLines={1}` for single-line), no negative `letterSpacing`, screen-reader labels on interactive controls, decorative elements hidden from a11y (stamps, barcodes, crop marks, grain).
- **Performance**: keep the Home scroll smooth; lazy-mount heavy Skia; FlatList entrance animations run once per key per session.
- **Route files stay thin**; behavior in shared controllers; presentation in editorial views (per `AGENTS.md`).
- **Tokens before literals**: use `space`/`tracking`/`ruleWeight`/palette; no ad-hoc pixels or letterSpacing literals.
- **Validation per touched surface** (per `AGENTS.md`): app TS → `rtk tsc`; lint → `rtk lint`; Supabase logic → targeted Deno test; broad changes → `make check`. Visual via `app/skin-fixtures.tsx` + device.
- **Commits**: conventional, scoped, one logical change each; end messages with the `Co-Authored-By` trailer.

---

## 7. AGENTS.md updates required (do in the same PRs)

The implementing agent must update `AGENTS.md` as these land, or the guide drifts:
- **Masthead system** (A1): new `EditorialMasthead` running-head contract on Home/Archive/Profile/Recap.
- **Archive rows** (A4): rows now carry cover thumbnails + rating stamp/`WAITING` tag — the current text-only-rows description changes.
- **Profile identity** (A5): subscriber-since line, `VOL.` chip, stat-strip styling.
- **Onboarding** (B1): new `(onboarding)` flow + `onboarding_seen` SecureStore flag + reuse of the OAuth handler.
- **Streak** (B2): new streak module + `lib/streak.ts` client computation contract.
- **Share variants** (B3): `ShareCard` is now format-parameterized; file-first mechanism unchanged; document the format picker and the capture-edition decision.
- **Recap** (B4): new `get_monthly_recap` RPC (shape + grants), new route, `lib/recap.ts` hook.
- **Night Edition** (C1): the "Palette source of truth is `theme/colors.js` / `skinStyles.ts`" line becomes "palettes resolved via `EditorialThemeProvider`/`useEditorialPalette`"; document day/night palettes, the edition toggle, persistence, and the share-capture-edition rule.
- **Motion** (C2/C3): Skia/Lottie added to dependency rules; document the halftone cover, ink-press, ink-bleed, and page-turn contracts and their Reduce-Motion fallbacks.

---

## 8. Manual steps the user must run (surface these, don't run silently)

- **Phase C deps**: `npx expo install @shopify/react-native-skia lottie-react-native` (fallback `npm install ... --legacy-peer-deps` + `npx expo install --check`).
- **Recap migration (B4)**: `supabase db push` → `npm run db:types` (order matters: types must reflect the applied DB). Re-check `never`-cast RPC call after regen.
- **Metro cache**: `npx expo start -c` after any `tailwind.config.js` change.
- No new Edge Functions are required unless recap aggregation is moved into a function (the plan uses an RPC, so deploy is not needed for B4).

---

## 9. Out of scope (explicitly)

- Full-bleed hero (owner chose Hybrid — keep the cover plate).
- Wholesale renaming of core product copy to periodical language (owner chose Selective).
- i18n / Russian UI strings (invariant: English only).
- Library/Friends/Stats tabs (invariant: gone in v1).
- Push-time scheduling, account deletion, social features (deferred elsewhere).
- Changing recommendation/scoring behavior — this is a design overhaul; the algorithm, day-1 deferral, sync, and external-API discipline are untouched.

---

## 10. Risks & open questions

- **Night Edition migration size** (C1): touching every editorial component to read a palette hook is the biggest risk. Mitigated by A0's split and per-file incremental migration. If it balloons, spin out a dedicated sub-plan.
- **Skia on low-end devices / Expo Go** (C2): verify Skia works in the user's Expo Go SDK before committing to it; if Expo Go can't load it, the user needs a dev client. Flag early. Always keep a non-Skia fallback so the app degrades gracefully.
- **Share capture edition** (C1/B3): decide whether shared PNGs always render Day (recommended for legibility outside the app) or follow the in-app edition. Document the choice.
- **Recap data shape** (B4): confirm `get_profile_overview` doesn't already expose enough for a lightweight client-only recap before adding an RPC; if it nearly does, prefer extending it over a new function (smaller surface). Re-check current code first.
- **Onboarding placement** (B1): confirm whether it wraps the existing sign-in screen or precedes it; reuse `SignInController` either way — do not duplicate OAuth.
- **Masthead vs Home kicker** (A1): reconcile so Home doesn't show the `№/date` twice.

---

## Appendix — phase dependency graph

```
A0 (split) ──> A1 masthead ──> A2 type ──> A3 micro ──> A4 archive ──> A5 profile ──> A6 states
                                                                                          │
                              B1 onboarding ── B2 streak ── B3 share ── B4 recap ◄────────┘
                                                                                          │
                                              C1 Night ── C2 Skia ── C3 page-turn ◄───────┘
```
A0 blocks everything (do it first). Within B, tasks are independent. C1 should precede C2/C3 (motion is authored once, in both editions). Owner may ship after A, after B, or after C.
