# Profile Screen Design Remediation Plan

Status: plan.
Created: 2026-06-02.

## Goal

Bring the Profile screen in line with the locked editorial/PRESS direction and make it feel like a
personal listening identity, not an operational settings ledger.

The screen should keep the current product scope: private profile, Spotify connection status,
library sync controls, taste overview, listening summary, and sign out. The remediation should not
add new tabs, public profile behavior, delete-account flow, push settings, skin toggles, i18n, or
rating-driven recommendation logic.

## Current Problems To Fix

1. The Profile screen does not apply top safe-area padding, so the masthead can sit too close to
   the status bar on notched iPhones.
2. The bottom padding is a fixed number and is not tied to the tab bar/home indicator safe area.
3. App text disables system font scaling, while Profile relies on many small mono labels.
4. During overview loading, the hero ledger renders `0 / 0 / 0`, which looks like real data.
5. The screen reads more like settings/statistics than a music taste identity.
6. Operational sections have nearly the same visual weight as taste/listening content.
7. Taste map top artists are rendered as a dry table instead of a curated identity surface.
8. Long artist names in Taste map are truncated to one line.
9. Decade bars are visually utilitarian and do not feel like an editorial music object.
10. Listening summary underuses the emotional rating model.
11. The Spotify Free badge uses green text on paper with insufficient contrast.
12. Profile uses Spotify green outside Spotify-branded sign-in/opening UI, drifting from the
    color contract.
13. The sync button receives `Syncing...` but the button component renders generic `Working...`.
14. Sync failure copy can render raw backend errors and visually dominate the section.
15. `app/skin-fixtures.tsx` has no Profile fixture scenarios, so visual regressions are hard to
    catch quickly.

## Design Principles

- Keep the editorial skin sharp: paper, ink, ruled typography, scarce static accent, no glass,
  no rounded SaaS cards, no decorative blobs.
- Make Profile hierarchy explicit: identity and taste first; operations second; destructive
  actions last.
- Use data honestly. Loading should look like loading, not zero-state. Empty should look intentional,
  not broken.
- Prefer wrapping and adaptive layout over truncation for names and labels.
- Improve accessibility without changing the product voice: safe areas, touch targets, contrast,
  readable fallbacks, and reduced visual noise.
- Keep behavior in shared controllers and presentation in the editorial skin.

## Phase 1 - Layout Safety And Honest Loading

Files:

- `components/skins/editorial/index.tsx`
- `components/ui/Text.tsx`
- possibly `theme/skins/types.ts` if Profile needs insets passed from the controller, though the
  simpler path is to use `useSafeAreaInsets()` inside the editorial view.

Tasks:

1. Add safe-area-aware top and bottom spacing to `EditorialProfileView`.
   - Use `useSafeAreaInsets()`.
   - Top padding should be `max(16, top + 8)` or an equivalent editorial spacing rule.
   - Bottom padding should account for the tab bar and bottom inset instead of relying only on `108`.

2. Replace fake zero stats while `overviewLoading` is true.
   - Hero subtitle can remain copy-based if it does not imply loaded metrics.
   - Ledger stats should show skeleton/placeholder rows or an explicit loading treatment.
   - Listening should not render the empty state until overview loading is finished.

3. Revisit text scaling.
   - Remove global `allowFontScaling={false}` if feasible.
   - If full removal creates broad risk, introduce a controlled prop/default strategy and update
     Profile text first.
   - Check small mono labels for clipping when system text size increases.

Acceptance:

- Profile masthead does not collide with the status bar on notched iPhones.
- Last action is comfortably above the tab bar and home indicator.
- Loading state never shows misleading `0` stats.
- Enlarged system text remains readable and does not create obvious overlaps.

## Phase 2 - Rebalance Profile Hierarchy

Files:

- `components/skins/editorial/index.tsx`
- `components/skins/editorial/EditorialSectionRule.tsx` if reusable hierarchy variants are needed.

Tasks:

1. Turn the hero into a stronger listening identity block.
   - Keep `COLOPHON` masthead.
   - Make avatar/name/streak feel like the owner of the page, not just a row.
   - Add a subtle editorial identity treatment using ruled layout, paper-alt backing, or an
     asymmetric masthead composition.
   - Avoid decorative gradients/orbs and avoid making it look like a generic card.

2. Visually subordinate operational sections.
   - Taste and Listening should be the strongest sections after the hero.
   - Production notes, Connections, and Log out should feel quieter and more utilitarian.
   - Sync controls should not look like the primary product CTA unless a sync is actively needed.

3. Separate sign out from product content.
   - Keep the destructive red tone.
   - Add clearer spatial separation before the logout action.
   - Avoid making Log out compete with Sync library now.

Acceptance:

- First glance communicates "my listening identity" before "settings".
- Sync/connection/logout remain available but no longer dominate the screen.
- The page still matches the editorial skin across Home and Discoveries.

## Phase 3 - Make Taste Map Feel Curated

Files:

- `components/skins/editorial/index.tsx`
- possibly extract small presentation helpers under `components/skins/editorial/` if the skin file
  becomes too dense.

Tasks:

1. Replace the dry artist table with a curated editorial treatment.
   - Use ranked rows only if they feel intentional, not tabular filler.
   - Consider artist "strips" or compact markers with counts.
   - Preserve clear hierarchy and avoid generic rounded tag clouds.

2. Allow long artist names to wrap cleanly.
   - Prefer two lines for artist names.
   - Keep rank/count alignment stable.
   - Avoid horizontal overflow and avoid one-line truncation for important identity text.

3. Redesign decade bars.
   - Move from plain progress bars toward a "record shelf" or ruled timeline feel.
   - Keep text counts visible; do not communicate the data by bar length alone.
   - Ensure very small values still have a visible minimum representation or clear label.

4. Restore the library span line when available.
   - The old `TasteSection` had `copy.profile.librarySpan(...)`.
   - Add this back in editorial form if `span_min` and `span_max` are present.

Acceptance:

- Taste map looks like part of the product identity, not analytics debug output.
- Long artist names wrap without breaking layout.
- Decade data remains understandable in text and visually stronger than a basic progress bar.

## Phase 4 - Improve Listening Summary

Files:

- `components/skins/editorial/index.tsx`
- `lib/copy.ts` if new short copy strings are useful.

Tasks:

1. Use emotional rating language in the summary.
   - Keep `rated this month` and `loved` if useful.
   - Add or swap in a dominant/average mood label derived from `avg_score`, similar to the existing
     `ListeningSummary` helper.
   - Avoid overemphasizing numeric averages because ratings are emotional labels.

2. Improve the rated archive action.
   - Replace the literal arrow character with styling/icon treatment if consistent with current
     editorial controls.
   - Make the action visually secondary to the journal summary but still clearly tappable.

3. Make empty and loading states distinct.
   - Loading: skeleton or restrained placeholder.
   - Empty: journal-oriented copy after data has actually loaded.

Acceptance:

- Listening summary reflects the five emotional rating labels.
- Empty Profile still feels intentional after first sync.
- The archive link is touch-friendly and does not overpower the section.

## Phase 5 - Fix Badges, Sync Copy, And Error Surfaces

Files:

- `components/skins/editorial/index.tsx`
- `components/skins/editorial/EditorialMarker.tsx`
- `components/skins/shared/skinStyles.ts`
- `theme/colors.js` only if token changes are necessary.

Tasks:

1. Remove Spotify green from Profile badges.
   - Use an ink/paper marker for both Free and Premium, or introduce a semantic non-Spotify
     editorial badge tone.
   - Keep Spotify green reserved for Spotify-branded buttons/contexts.

2. Fix Free/Premium badge contrast.
   - All badge text/background pairs should meet at least 4.5:1 for normal text.
   - Do not rely on color alone to distinguish Free from Premium.

3. Make sync button loading copy specific.
   - `EditorialActionButton` should preserve the provided title while loading, or accept a
     `loadingTitle`.
   - Profile should show `Syncing...` or equivalent specific text, not generic `Working...`.

4. Sanitize sync failure presentation.
   - Use concise user-facing copy.
   - Keep raw backend details out of the primary visual surface.
   - If detail is needed, show a short cause plus retry path, not a long technical string.

5. Make sync banner visually subordinate unless failed.
   - Active sync can use paper-alt/ink and the progress bar.
   - Failure can use red, but with controlled copy length and spacing.

Acceptance:

- Free/Premium markers pass contrast and follow palette rules.
- Syncing state copy is specific.
- Failed sync state is clear but does not overwhelm the Profile screen.

## Phase 6 - Add Profile Visual Fixtures

Files:

- `app/skin-fixtures.tsx`
- possibly a small local fixture helper in the same file.

Tasks:

Add Profile fixture cases that render through `components.ProfileView`:

1. Rich profile:
   - Long display name.
   - Avatar present.
   - High streak/discovered/rated numbers.
   - Top artists with long names.
   - Multiple decades.
   - Premium badge.

2. Empty/low-data profile:
   - No taste data.
   - No ratings.
   - Library synced with a small album count.

3. Syncing profile:
   - Active sync banner and disabled sync button.

4. Failed/stale sync profile:
   - Failure banner with representative safe copy.
   - Free badge.

Acceptance:

- Designers/developers can open the fixture route and inspect Profile states without real account
  data.
- Fixtures include long text and large numbers to catch overflow.
- Fixture route remains clearly temporary QA material and does not alter production navigation.

## Suggested Implementation Order

1. Phase 1 first, because safe-area and honest loading are correctness/accessibility issues.
2. Phase 5 badge/copy fixes next, because they are small and remove clear contrast/contract issues.
3. Phase 2 hero/hierarchy, because it establishes the visual direction for the rest.
4. Phase 3 Taste map and Phase 4 Listening summary, because they are the most design-sensitive
   content changes.
5. Phase 6 fixtures last, then use them for final QA. If preferred, fixture scaffolding can happen
   before Phase 2 to speed visual iteration.

## Validation Checklist

Run after implementation:

- `npm run typecheck`
- `npm run lint`
- Manual device or simulator check on Profile.
- Check Profile with:
  - long Spotify display name,
  - no avatar,
  - large stats,
  - empty taste,
  - rich taste,
  - active sync,
  - failed/stale sync,
  - Free and Premium badges,
  - larger iOS text size if feasible.

If NativeWind/font config changes, clear Metro cache with:

```sh
npx expo start -c
```

## Open Questions

No blocking questions. The plan assumes:

- The editorial/PRESS skin remains the only active skin.
- Profile should stay English-only.
- Sync controls stay on Profile.
- The remediation should be visual/layout/copy focused and should not change recommendation logic,
  database schema, OAuth behavior, or library sync semantics.
