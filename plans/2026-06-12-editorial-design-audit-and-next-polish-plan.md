# Editorial Design Audit And Next Polish Plan

Status: proposal.
Created: 2026-06-12.

## Goal

Album of the Day already has a strong PRESS/editorial identity. The next design pass should not replace
that style. It should make the current direction feel more expensive, intentional, and finished across
every surface: Home, Discoveries, Profile, sign-in/onboarding, system states, tab chrome, and share card.

The desired result: the app should feel like a small daily music publication, not a React Native app that
has been themed to look editorial.

## Inputs Reviewed

- Current product and design contracts from `AGENTS.md`.
- Locked editorial direction in `plans/editorial-redesign-final.md`.
- Implemented visual polish plan in `plans/2026-06-11-editorial-visual-polish.md`.
- Current editorial skin implementation:
  - `components/skins/editorial/index.tsx`
  - `components/skins/editorial/EditorialAlbumActions.tsx`
  - `components/skins/editorial/EditorialActionButton.tsx`
  - `components/skins/editorial/EditorialCropMarks.tsx`
  - `components/skins/editorial/EditorialMarker.tsx`
  - `components/skins/editorial/EditorialSectionRule.tsx`
  - `components/skins/editorial/EditorialSpecLine.tsx`
  - `components/skins/editorial/PaperGrain.tsx`
  - `components/skins/editorial/accent/*`
- Current tokens and chrome:
  - `theme/colors.js`
  - `components/skins/shared/skinStyles.ts`
  - `theme/skins/registry.ts`
  - `theme/skins/types.ts`
  - `app/(tabs)/_layout.tsx`
  - `lib/navigationChrome.ts`
- Existing visual fixture route: `app/skin-fixtures.tsx`.
- HTML mockups under `design/mockups/`, especially `00-FINAL-locked-home.html` and
  `00-FINAL-home-improvement-variants.html`.
- Profile remediation plan in `plans/profile-screen-design-remediation-plan.md`.
- UI/UX checklist from the local `ui-ux-pro-max` skill.

Visual verification note: Expo web could not run because `react-dom` and `react-native-web` are not
installed. The in-app Browser also blocks direct `file://` mockup URLs by policy, so this audit is based on
code, plans, and HTML mockup source rather than live browser screenshots.

## Current Strengths

1. **The style direction is distinctive and worth preserving.**
   The paper/ink palette, hard rules, Archivo display type, mono details, Space Grotesk prose, paper grain,
   crop marks, and scarce flowing accent are coherent. The app has a clear point of view.

2. **Home has the strongest composition.**
   The daily pick as an issue cover works: folio, masthead, accent rule, title over cover plate, spec line,
   "Why this one?", ink-slab Spotify CTA, share action, and ballot are all part of the same metaphor.

3. **The interaction language is on-style.**
   Pressed states that invert ink/paper are much better than generic opacity. Haptics are present but
   restrained. Reduce Motion is respected by the shared accent flow and skeletons.

4. **The product hierarchy is now clearer than the older app shape.**
   Home is the current issue, Discoveries is the archive, Profile is the colophon/listening ledger. The old
   Library tab is gone from the visible product.

5. **The registry has collapsed to editorial.**
   `theme/skins/registry.ts` exposes only the editorial skin, so the main app no longer has an active visual
   bakeoff at runtime.

## Main Opportunities

### 1. Turn the visual language into reusable publication primitives

The editorial skin currently contains many good decisions, but several are still repeated as one-off layout
patterns inside `components/skins/editorial/index.tsx`. That makes future polish harder and increases the
chance of tiny inconsistencies.

Recommended improvement:

- Add small skin-native primitives for repeated publication patterns:
  - `EditorialPage`
  - `EditorialMasthead`
  - `EditorialIssueFrame`
  - `EditorialLedgerRow`
  - `EditorialProofState`
  - `EditorialMetric`
- Extend `skinStyles.ts` with type, z-index, and touch-target tokens.
- Finish token usage in small components. Example: `EditorialMarker` and `EditorialSpecLine` still use
  direct `letterSpacing: 0.8` instead of `tracking.label`.

Why it matters: the current design already looks good, but a reusable layout system will make every future
screen feel authored by the same publication desk.

### 2. Make loading, empty, and error states feel like designed pages

The content screens have strong editorial treatment, but some states still feel closer to generic skeletons
or utility panels. These states are part of the perceived quality because users see them on cold starts,
network failures, first sync, and deep links.

Recommended improvement:

- Replace the simple album skeleton with an editorial proof-sheet skeleton:
  - folio placeholder
  - masthead/title blocks
  - cover plate placeholder with crop marks
  - ruled spec and CTA placeholders
- Wrap skin states in an `EditorialStateShell` so grain, spacing, and page rhythm are consistent even when
  states are rendered inside generic `Screen`.
- Make `PickError`, `EmptyState`, and discovery-detail loading look like actual missing/failed issues.
- Keep copy concise and recovery-oriented.

Why it matters: premium apps do not only look good when data is loaded.

### 3. Give Discoveries a stronger archive identity

The archive list is functional and already much better than a generic list. It can still feel more like a
printed table of contents.

Recommended improvement:

- Strengthen the archive header with a clearer folio/contents relationship and slightly more publication
  metadata.
- Consider sticky month headers if they behave well on device.
- Tune row rhythm:
  - stronger issue-number column alignment
  - more deliberate separation between title, artist/date, and marker
  - consistent thumb sizing and optional tiny crop-mark treatment only if it does not add noise
- Make filter tabs feel like archive index tabs, not generic segmented controls.
- Improve list empty/error states through the same `EditorialProofState`.

Why it matters: Discoveries is where the app becomes a long-lived object, not just a daily recommendation.

### 4. Push Profile from "good ledger" to "personal music colophon"

Profile is already much closer to the locked direction after the remediation work. The next opportunity is
not safety or correctness. It is identity.

Recommended improvement:

- Recompose the profile hero as an identity plate:
  - display name and avatar remain strongest
  - product/free-premium marker is present but not brand-green
  - issue count/streak/rated metrics feel integrated, not just three stats below
- Make Taste map more tactile:
  - top artists as a ruled ranked ledger with stronger typographic hierarchy
  - decade data as a record-shelf/timeline treatment with visible counts
  - no generic progress-bar feeling
- Make operational sections quieter:
  - Production notes, Connections, Sync, and Log out should remain accessible but visually subordinate.
- Keep all existing privacy/product copy. Do not make Profile public or social.

Why it matters: Profile should be the user's listening identity, not the app's settings screen.

### 5. Polish Home as the flagship surface, not by adding more decoration

Home is already the best surface. The improvements should be precise, not flashy.

Recommended improvement:

- Add a QA-driven title-over-cover legibility guard for long titles and busy covers.
- Rework the "past picks waiting" footer into an editorial action/nudge instead of a plain bordered
  Pressable.
- Make the Free Spotify callout visually related to production notes while preserving its clarity.
- Improve the rating note area with a visible label, saved/dirty feedback, and a more print-form feel.
- Keep the existing CTA direction. Do not switch to glass, glow, pill buttons, or broad gradients.

Why it matters: this screen carries the brand. Small issues here are disproportionately visible.

### 6. Make tab chrome feel like the publication footer

The current tab bar is correct and safe-area-aware. It can be made more authored.

Recommended improvement:

- Keep three tabs and visible labels exactly Home / Discoveries / Profile.
- Preserve the static printed-rule active indicator.
- Consider a slightly more editorial footer treatment:
  - stronger top rule rhythm
  - clearer active issue mark
  - consistent icon/label optical alignment
  - no floating card, no glass, no pill navigation
- Validate at large Dynamic Type so labels do not crowd.

Why it matters: tab chrome is visible constantly, so a small refinement compounds.

### 7. Clean up legacy visual debt

Several older rounded/glass components remain in the repo. They do not appear to drive the current main
editorial flow, but they are still available and visually conflict with the locked direction.

Examples:

- `components/album/AlbumHero.tsx`
- `components/album/AlbumActions.tsx`
- `components/album/WhyThisAlbum.tsx`
- `components/album/RatingEditor.tsx`
- `components/album/DiscoveryListItem.tsx`
- `components/ui/Card.tsx`
- `components/ui/Button.tsx`
- `components/ui/Badge.tsx`
- `components/home/PickError.tsx`
- `components/profile/ListeningSummary.tsx`
- `components/library/SyncBanner.tsx`

Recommended improvement:

- Classify each as `used`, `unused legacy`, or `generic fallback`.
- Delete unused legacy components if no route imports them.
- If a generic primitive must remain, either document it as non-editorial fallback or restyle it so future
  work cannot accidentally reintroduce the old rounded/glass language.
- Update stale comments such as sync banner references that still mention old Home/Library/Profile mounts.

Why it matters: design quality is partly a codebase affordance. The easier path should be the correct visual
path.

### 8. Add a real visual QA workflow

The app has `app/skin-fixtures.tsx`, but it currently focuses heavily on Profile and Discoveries. It should
become the design QA gallery for the whole editorial skin.

Recommended improvement:

- Expand fixtures to cover:
  - Home/detail with dark, bright, saturated, busy, missing, and long-title covers
  - Free and Premium Spotify states
  - all rating states plus unsaved note
  - loading, waiting, empty, error, retrying
  - Discoveries filters and month groups
  - Profile rich, empty, loading, failed, syncing
  - Share card
- Add a manual QA checklist for device review:
  - iPhone SE size
  - large iPhone size
  - largest Dynamic Type
  - Reduce Motion
  - light/dark OS settings if relevant to native chrome
  - offline/network error
- Do not add web dependencies solely for screenshots unless we decide web visual regression is worth the
  maintenance cost.

Why it matters: visual polish decays unless there is a cheap way to inspect the whole system.

## Improvement Options

### Option A: System polish pass, recommended

Keep the current PRESS direction and improve consistency, states, archive/profile depth, and fixtures.

Pros:

- Lowest product risk.
- Preserves what already works.
- Gives visible quality gains without another redesign.
- Best match for current contracts.

Cons:

- Less dramatic than a full visual refresh.
- Requires disciplined small edits across several files.

### Option B: More expressive magazine refresh

Push asymmetry, larger display type, more poster-like profile/archive layouts, and stronger visual drama.

Pros:

- Biggest perceived "wow" if executed well.
- Could make the app feel more like a boutique publication.

Cons:

- Higher accessibility risk with long text and Dynamic Type.
- More device QA needed.
- Easier to overdo and distract from the album cover.

### Option C: Design-system cleanup first

Spend the first pass deleting legacy components, extracting editorial primitives, and expanding fixtures
before making visible changes.

Pros:

- Reduces future drift.
- Makes later polish safer and faster.

Cons:

- Smaller immediate visual payoff.
- Some cleanup may not be user-visible.

## Recommendation

Use **Option A** as the main path, with the first phase of **Option C** folded in. Do not choose Option B
unless we explicitly want a more dramatic redesign session later.

The app does not need a new aesthetic. It needs the current aesthetic applied with stricter composition,
better state design, and less leftover old UI vocabulary.

## Implementation Plan

### Phase 0: Baseline and guardrails

Files:

- `app/skin-fixtures.tsx`
- `plans/editorial-redesign-final.md`
- this plan

Tasks:

1. Add a short implementation note at the top of the working branch or PR: "visual polish only, no product
   behavior changes."
2. Before editing, capture device screenshots manually from:
   - Home loaded
   - Home long title or busy cover fixture
   - Discoveries all/rated/pending
   - Discovery detail
   - Profile rich and failed sync
   - Sign-in and initial sync
   - Share card
3. Confirm these non-goals:
   - no dark SaaS look
   - no glass or blur
   - no new tabs
   - no rating-driven recommendation copy
   - no Spotify green outside Spotify-branded sign-in/opening UI
4. Use device-first visual QA. Do not install `react-dom` or `react-native-web` only to make screenshots
   easier unless we explicitly decide to support web visual regression.

Validation:

- No code validation required yet.

### Phase 1: Editorial primitives and token completion

Files:

- `components/skins/shared/skinStyles.ts`
- `components/skins/editorial/EditorialMarker.tsx`
- `components/skins/editorial/EditorialSpecLine.tsx`
- `components/skins/editorial/EditorialSectionRule.tsx`
- new files under `components/skins/editorial/` if extraction stays small
- `components/skins/editorial/index.tsx`

Tasks:

1. Add or formalize tokens:
   - type scale for display, archive title, mono label, prose body
   - z-index scale for grain, title-over-cover, markers, top safe-area patch
   - touch target minimums
   - layout gutters and section gaps if they are currently repeated
2. Replace remaining literal tracking and repeated small values in editorial components.
3. Extract only the primitives that immediately reduce duplication:
   - `EditorialMasthead`
   - `EditorialLedgerRow`
   - `EditorialStateShell`
   - `EditorialIssueFrame`
4. Keep `components/skins/editorial/index.tsx` readable. Do not create abstractions that hide one-off
   product logic.

Validation:

- `rtk tsc`
- `rtk lint`

### Phase 2: State and skeleton redesign

Files:

- `components/skins/editorial/index.tsx`
- possible new `components/skins/editorial/EditorialStateShell.tsx`
- `app/(tabs)/index.tsx`
- `app/discoveries/[aotdId].tsx`
- `components/ui/Screen.tsx` only if absolutely necessary

Tasks:

1. Replace `AlbumDetailSkeleton` with a proof-sheet skeleton that matches the loaded Home/detail layout.
2. Ensure loading/error/empty states include paper grain when they occupy a full screen.
3. Make discovery-detail loading and errors feel like the same publication system as Home.
4. Keep error recovery actions obvious and touch-friendly.
5. Avoid animated accent in error/empty/skeleton states.

Validation:

- `rtk tsc`
- `rtk lint`
- Manual device check of cold load, network error, and missing discovery states.

### Phase 3: Home detail refinements

Files:

- `components/skins/editorial/index.tsx`
- `components/skins/editorial/EditorialAlbumActions.tsx`
- `components/skins/editorial/EditorialActionButton.tsx`
- `app/(tabs)/index.tsx`

Tasks:

1. Rework the old-pending-picks footer into a proper editorial nudge:
   - mono label
   - short prose line
   - clear archive action affordance
   - ink/paper pressed inversion
2. Add a visible label and clearer state treatment for the private note input.
3. Add save feedback that does not become noisy:
   - saving
   - saved
   - failed retry path
4. QA title-over-cover on long, bright, dark, and busy covers.
5. If needed, add a restrained title legibility treatment that preserves the approved overlap.

Validation:

- `rtk tsc`
- `rtk lint`
- Manual device check for long title, missing cover, Free Spotify, rating all five options, note keyboard.

### Phase 4: Discoveries archive polish

Files:

- `components/skins/editorial/index.tsx`
- `components/skins/shared/DiscoveriesController.tsx` only if data shape or filter props need tiny support
- `app/skin-fixtures.tsx`

Tasks:

1. Strengthen the archive masthead area without adding new product copy.
2. Tune filter tabs as archive index controls.
3. Improve row visual hierarchy:
   - issue number column
   - cover thumb frame
   - title/artist/date spacing
   - status marker weight
4. Evaluate sticky month headers. Keep only if they feel native and do not fight scroll performance.
5. Expand fixtures for multiple months and mixed statuses.

Validation:

- `rtk tsc`
- `rtk lint`
- Manual device scroll check on a long archive list.

### Phase 5: Profile colophon polish

Files:

- `components/skins/editorial/index.tsx`
- `app/skin-fixtures.tsx`

Tasks:

1. Recompose the identity block so avatar, display name, and ledger metrics feel like one publication
   section.
2. Upgrade decade bars into a more editorial shelf/timeline treatment while keeping counts visible.
3. Make operational sections visually quieter:
   - Production notes
   - Connections
   - Sync controls
   - Log out
4. Validate Free/Premium profile text and marker contrast.
5. Keep loading honest and empty states distinct.

Validation:

- `rtk tsc`
- `rtk lint`
- Manual check with rich, empty, loading, failed, and free-account fixtures.

### Phase 6: Tab chrome, sign-in, onboarding, and share card

Files:

- `app/(tabs)/_layout.tsx`
- `app/_layout.tsx`
- `app/auth/callback.tsx`
- `app/+not-found.tsx`
- `components/skins/editorial/index.tsx`
- `components/auth/SpotifyButton.tsx` only if button alignment needs adjustment

Tasks:

1. Refine tab bar optical alignment:
   - active indicator
   - icon/label spacing
   - bottom inset
   - large text behavior
2. Bring auth callback and not-found screens closer to the editorial state system.
3. Evaluate BootSplash grain and spacing. Keep it quiet.
4. Share card v2:
   - improve long-title wrapping
   - consider adding issue metadata/spec in the same print language
   - keep RN `Image`, static accent only, and deterministic barcode

Validation:

- `rtk tsc`
- `rtk lint`
- Manual share capture on iOS.

### Phase 7: Legacy visual debt cleanup

Files:

- legacy files listed in the "Clean up legacy visual debt" section
- any imports discovered by `rtk grep`

Tasks:

1. Run targeted import search for each legacy component.
2. Delete unused components that are not part of the current product.
3. For shared primitives that remain, either:
   - restyle them toward PRESS-safe defaults, or
   - document them as generic fallback not used by the editorial skin.
4. Update stale comments that describe old Home/Library/Profile sync mounts.

Validation:

- `rtk tsc`
- `rtk lint`

## Priority Order

1. Phase 1: primitives and tokens.
2. Phase 2: states and skeletons.
3. Phase 3: Home refinements.
4. Phase 4: Discoveries archive.
5. Phase 5: Profile colophon.
6. Phase 6: tab/auth/share polish.
7. Phase 7: legacy cleanup.

Reason: token/primitives and states create the foundation, Home preserves the flagship quality, then
Discoveries/Profile bring the rest of the app up to the same level. Cleanup is useful but should not block
visible quality unless legacy code starts interfering.

## QA Checklist

Device and layout:

- iPhone SE width or similarly small viewport.
- Large iPhone.
- Long album title, long artist name, long profile display name.
- Missing cover.
- Bright cover.
- Dark cover.
- Busy/saturated cover.
- Country chip present and absent.

Accessibility:

- Largest Dynamic Type.
- Reduce Motion enabled.
- VoiceOver labels for tab bar, back button, rating rows, CTA, share, sync, and archive rows.
- Touch targets at least 44pt.
- No important text clipped at large font sizes.

Behavior:

- Pull-to-refresh on Home, Discoveries, Profile.
- Keyboard over private note.
- Free Spotify awaited explainer before opening.
- Share card capture.
- Sync failed, stale, syncing, and completed states.
- Discovery detail back behavior.

Commands after implementation phases:

- `rtk tsc`
- `rtk lint`

Use `make check` only if a phase expands beyond visual/editorial presentation files.

## Open Questions

1. Should the next pass optimize for **subtle premium polish** or for a **more expressive magazine/poster
   feel**?
2. Which surface should get the most attention first after the shared primitives: Home, Discoveries,
   Profile, or Share card?
3. Are we comfortable deleting unused legacy rounded/glass components, or should they stay as fallback
   primitives for now?

My recommendation: subtle premium polish first, Home plus states second, then Discoveries/Profile, and delete
unused legacy components once import search confirms they are not active.
