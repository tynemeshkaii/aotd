# Visual Polish Remediation Plan

> Goal: make Album of the Day feel like a finished, stylish, modern music product for a normal user, not a polished MVP. This plan turns the visual audit into an ordered implementation roadmap with file targets, acceptance criteria, QA gates, and user decisions needed before final execution.

**Status:** proposed plan, not implemented  
**Date:** 2026-05-31  
**Audience:** v1 English-speaking users  
**Design target:** refined, dark, editorial, music-first, "album in your hand" feeling  
**Primary constraint:** stay Expo Go / SDK 54 compatible unless a later explicit release-build decision changes that

---

## 0. Audit Summary

The app already has a strong foundation: dark wine-black surfaces, cream text, gold accents, a shared album-detail surface, blurred cover backdrops, haptics, skeletons, and a richer Profile screen. The current visual risk is not "ugly"; it is that several surfaces still feel like a functional MVP:

- App icon and splash are still default/generic and do not match the product.
- Sign-in is too plain for a music app's first impression.
- Profile and Discoveries rely on repeated cards, similar radii, and utilitarian layout.
- Typography uses the system font and has limited brand personality.
- Long album/artist names can break the hero/share/list composition.
- Share card is functional but not yet a branded artifact users would feel proud to post.
- Some secondary states and accessibility details need a final production pass.

This plan focuses only on visual/UX quality. It deliberately avoids recommendation logic, social features, skip mechanics, ratings-as-algorithm-input, localization, and new backend product scope.

---

## 1. Success Criteria

The visual pass is complete when:

1. The app icon, splash, sign-in, Home album detail, Discoveries, Profile, Share Card, loading, empty, and error states all feel like one coherent product.
2. No visible Expo/default placeholder branding remains.
3. All UI copy visible in v1 is English.
4. Every core screen is comfortable on small phones, large phones, and with larger system text.
5. All primary touch targets are at least 44pt high/wide.
6. Normal text contrast stays at or above WCAG AA.
7. Long album titles, long artist names, and long Spotify display names do not overlap, overflow, or make the layout look broken.
8. Motion and haptics feel intentional and respect Reduce Motion.
9. Share output looks polished even with long names and missing cover art.
10. On-device QA passes on iOS Expo Go and at least one Android device/emulator.

---

## 2. User Decisions Needed

These are the only decisions I would ask before implementation. If the user does not care, use the recommended choice.

| Decision | Recommended | Why |
|---|---|---|
| Brand mark direction | **A. Minimal record/calendar mark** | Fits "album of the day", scales well for app icon, splash, empty states, and share card. |
| Sign-in visual direction | **B. Editorial album wall / record sleeve** | More ownable than abstract gradients and more relevant than generic music icons. |
| Typography direction | **A. Premium system-safe first, optional custom font later** | Avoids dependency/licensing friction; can still improve scale, spacing, and hierarchy now. |
| Share card style | **A. Clean poster card** | Best for social sharing: cover dominant, title readable, app brand visible. |
| Tab bar treatment | **B. Refined solid/blur hybrid** | Keeps native predictability while adding product character. |

If custom typography is desired, make that a separate explicit decision because it may add `expo-font`, font licensing choices, and additional layout QA.

---

## 3. Implementation Order

Work in this order. Each chunk should be independently testable.

1. **Brand shell:** app icon, splash, logo/mark, 404 language cleanup.
2. **Design system hardening:** typography, radius/elevation, badges, section headers, pressable states.
3. **First-run experience:** sign-in, OAuth callback, first library sync.
4. **Album experience:** Home/detail hero, actions, rating editor, Spotify Free notice.
5. **Share card:** robust branded generated PNG.
6. **Discoveries:** list density, tabs, status chips, long-name behavior.
7. **Profile:** convert from stacked settings cards to taste identity.
8. **Navigation and system chrome:** tab bar, safe-area padding, status/splash consistency.
9. **Accessibility and QA:** dynamic type, reduce motion, device screenshots, final bug sweep.

---

## 4. Phase 1 — Brand Shell

### Scope

Replace remaining generic Expo identity and create the minimum brand system needed across the app.

### Files

- `assets/icon.png`
- `assets/splash-icon.png`
- `assets/android-icon-background.png`
- `assets/android-icon-foreground.png`
- `assets/android-icon-monochrome.png`
- `assets/favicon.png`
- `app.config.ts`
- `app/+not-found.tsx`
- Optional new file: `components/brand/BrandMark.tsx`

### Tasks

1. Create a simple, scalable brand mark:
   - Record/calendar hybrid, album sleeve, or monogram-style "AOTD".
   - Must work at 24px, app-icon size, splash size, and monochrome Android adaptive icon.
   - Use the existing burgundy/cream/gold palette.

2. Replace app assets:
   - `icon.png`: full-size iOS icon, no transparency.
   - Android foreground/background/monochrome assets.
   - `splash-icon.png`: centered brand mark, no debug-grid look.
   - `favicon.png`: readable at 48px.

3. Update config colors:
   - Replace `#0a0a0a` in `app.config.ts` with the actual brand background token value or a matching static hex.
   - Keep `userInterfaceStyle: 'dark'`.

4. Fix 404 copy:
   - Replace Russian strings in `app/+not-found.tsx` with English.
   - Use `EmptyState` or a brand-mark based state instead of a raw "404" page if appropriate.

### Acceptance Criteria

- No default Expo icon/splash remains.
- App icon reads clearly on light and dark home screens.
- Splash does not look like a placeholder or debug asset.
- 404 screen is English-only and visually consistent with the rest of the app.

### Notes

Icon/splash changes require restarting Expo and may require a native rebuild to fully verify outside Expo Go.

---

## 5. Phase 2 — Design System Hardening

### Scope

Keep the current palette, but make the component system feel more intentional and less uniformly "rounded card".

### Files

- `theme/colors.js`
- `theme/colors.d.ts`
- `tailwind.config.js`
- `components/ui/Text.tsx`
- `components/ui/Button.tsx`
- `components/ui/Card.tsx`
- `components/ui/Screen.tsx`
- `components/ui/EmptyState.tsx`
- `components/ui/ErrorState.tsx`
- `components/ui/Skeleton.tsx`
- New: `components/ui/Badge.tsx`
- New: `components/ui/SectionHeader.tsx`
- New: `components/ui/PressableScale.tsx` or similar wrapper if useful

### Tasks

1. Typography refinement:
   - Remove `tracking-tight` from general headings unless a specific heading truly benefits.
   - Add clearer variants:
     - `display` for sign-in/brand moments.
     - `title` for album title.
     - `screenTitle` for top-level screens.
     - `sectionTitle`.
     - `body`, `caption`, `label`, `subtle`.
   - Add `lineHeight`-aware class usage where NativeWind allows it, especially captions and body copy.
   - Define truncation/wrapping rules per variant.

2. Radius and surface system:
   - Reduce generic card radius from always `rounded-2xl` to a scale:
     - Large hero surfaces: `rounded-2xl`.
     - Standard content cards: `rounded-xl` or `rounded-[14px]`.
     - Inputs/pills: `rounded-xl` / `rounded-full`.
   - Avoid nested card-on-card visuals.
   - Make `Card` support variants:
     - `default`
     - `elevated`
     - `glass`
     - `subtle`
     - `outline`

3. Elevation:
   - Define one shadow style for the album cover.
   - Define one subtle card shadow/elevation style if used.
   - Avoid random shadow values across components.

4. Badges:
   - Add a `Badge` primitive for statuses, Spotify Free/Premium, rating labels, and "Today".
   - Variants: `accent`, `muted`, `success-ish`, `warning-ish`, `rating`.
   - No raw hex inside components.

5. Section headers:
   - Add `SectionHeader` for Profile/Discoveries secondary blocks.
   - Include optional action slot, but keep touch target >=44pt.

6. Press states:
   - Standardize pressed feedback:
     - Buttons: opacity + subtle scale.
     - List items/cards: opacity + optional translate/scale.
   - Respect Reduce Motion by disabling scale/translate.

### Acceptance Criteria

- Profile and Discoveries no longer look like a stack of identical rounded boxes.
- Components use consistent radii and elevation.
- Status and rating UI uses one `Badge` language.
- Long text has an explicit strategy in all repeated components.

---

## 6. Phase 3 — Sign-In and First-Run Experience

### Scope

Make the first impression feel like a music product with taste, while keeping the flow simple and Spotify-compliant.

### Files

- `app/(auth)/sign-in.tsx`
- `components/auth/SpotifyButton.tsx`
- `app/auth/callback.tsx`
- `components/onboarding/InitialSyncingScreen.tsx`
- `components/ui/ProgressBar.tsx`
- Optional new: `components/brand/AlbumWall.tsx`
- Optional new: `components/brand/BrandHeader.tsx`

### Tasks

1. Rebuild sign-in as a real first screen:
   - Brand mark at top or integrated into hero.
   - Editorial album-wall / record-sleeve visual.
   - Keep copy concise:
     - Product name.
     - One-line value prop.
     - Spotify CTA.
     - Short privacy reassurance.
   - Avoid a marketing landing page; this is still the app's entry screen.

2. Spotify button:
   - Keep Spotify green and Spotify icon.
   - Ensure centered label does not collide with the absolute icon at narrow widths.
   - Add busy state with stable label width.
   - Keep touch target >=56pt.

3. OAuth callback:
   - Replace plain caption-only waiting state with branded loading state.
   - Do not log codes/tokens.
   - Error state returns user to sign-in cleanly.

4. Initial sync:
   - Replace generic music-note icon circle with brand mark or record animation.
   - Keep progress visible.
   - Make indeterminate "Connecting to Spotify..." visually distinct from determinate import progress.
   - Keep retry path prominent when sync is stale/failed.

### Acceptance Criteria

- A new user immediately understands the app's vibe.
- The sign-in screen looks finished even before real user data exists.
- First sync feels calm and trustworthy, not like a blocking technical operation.

---

## 7. Phase 4 — Album Experience Polish

### Scope

Preserve the strong shared `AlbumDetail` architecture, but make it robust and more premium.

### Files

- `components/album/AlbumDetail.tsx`
- `components/album/AlbumHero.tsx`
- `components/album/CoverBackdrop.tsx`
- `components/album/WhyThisAlbum.tsx`
- `components/album/AlbumActions.tsx`
- `components/album/RatingEditor.tsx`
- `components/album/AlbumDetailSkeleton.tsx`
- `components/home/PickError.tsx`
- `components/home/WaitingForPick.tsx`
- `app/(tabs)/index.tsx`
- `app/discoveries/[aotdId].tsx`

### Tasks

1. Hero long-text handling:
   - Album title: allow 2-3 lines, then reduce size or clamp elegantly.
   - Artist name: allow 1-2 lines depending on available space.
   - Metadata line: wrap safely or split into small chips.
   - Test with extreme examples:
     - `The Rise and Fall of Ziggy Stardust and the Spiders from Mars`
     - `Lift Your Skinny Fists Like Antennas to Heaven`
     - `Everywhere at the End of Time - Stage 6`

2. Cover treatment:
   - Keep the blurred backdrop, but ensure text never sits on low-contrast cover colors.
   - Add a stronger bottom scrim where necessary.
   - Verify no blank flash when cover loads slowly.

3. Header/back behavior:
   - Discovery detail back button should be at least 44pt.
   - Use a consistent glass/solid back-button style.
   - Keep native-feeling navigation.

4. Why-this-album:
   - Keep mandatory block.
   - Make it visually lighter and more editorial.
   - If selection reason includes source artists, avoid overlong one-line copy; wrap cleanly.

5. Actions:
   - Primary action remains "Open in Spotify".
   - Share button stays secondary but discoverable.
   - Spotify Free notice should be a small persistent badge/callout, not a loose line that looks like an afterthought.

6. Rating editor:
   - Make it feel like a journal surface, not a form.
   - Replace full gold selected fill with a more refined selected state if it feels too loud.
   - Add visible focus/active/error state to `TextInput`.
   - Add optional character count only if comment length is constrained later.
   - Keep microcopy: ratings are private and do not tune recommendations.

7. Loading/error/waiting:
   - `AlbumDetailSkeleton` should mirror final layout precisely.
   - `PickError` stays retryable.
   - `WaitingForPick` stays only for successful no-row response.

### Acceptance Criteria

- Album detail looks intentional with both beautiful and ugly cover art.
- Long titles do not break the screen.
- Rating feels personal and calm.
- Primary action is always obvious.
- No loading state appears as a blank screen.

---

## 8. Phase 5 — Share Card Polish

### Scope

Turn the generated share PNG into a branded object users would actually want to send.

### Files

- `components/album/ShareCard.tsx`
- `components/album/AlbumDetail.tsx`
- Optional new: `components/album/shareCardLayout.ts`

### Tasks

1. Redesign share card:
   - Poster-like layout.
   - Cover dominant.
   - App brand visible but not loud.
   - Spotify URL or short "Open on Spotify" line readable.
   - Include year only if present.

2. Robust text fitting:
   - Clamp title and artist.
   - Use adaptive font sizes for long strings.
   - Avoid URL overflow.
   - Test missing cover fallback.

3. Capture reliability:
   - Keep RN `Image` in ShareCard capture target.
   - Continue prefetching cover before capture.
   - Keep off-screen capture view stable.

4. Platform behavior:
   - iOS: React Native `Share.share` with PNG + text/URL.
   - Other platforms: `expo-sharing.shareAsync` PNG.
   - Error alerts should be concise and non-technical.

### Acceptance Criteria

- Share image looks good with long and short album names.
- No text overlap or clipping.
- Missing cover fallback still looks branded.
- Capture remains reliable on iOS.

---

## 9. Phase 6 — Discoveries Polish

### Scope

Make history/backlog feel like a curated record shelf, not a generic list.

### Files

- `app/(tabs)/discoveries.tsx`
- `components/album/DiscoveryListItem.tsx`
- `components/album/StatusTabs.tsx`
- `lib/recommendation.ts`

### Tasks

1. List item layout:
   - Allow album title up to 2 lines.
   - Keep artist readable.
   - Convert date/status into a `Badge` row.
   - Add subtle chevron or press affordance.
   - Keep item height stable enough for FlatList performance.

2. Status tabs:
   - Keep `All / Unrated / Rated`.
   - Increase touch height to at least 44pt.
   - Use an active indicator that feels more refined than full gold fill if needed.
   - Add accessibility role/label clarity.

3. Empty states:
   - All: "Your first discovery is coming" with branded illustration/mark.
   - Unrated: low-pressure backlog message.
   - Rated: journal-oriented prompt.

4. Loading/error:
   - Skeleton rows match final row geometry.
   - Retry error state uses `ErrorState`.

### Acceptance Criteria

- Discoveries scan quickly.
- Status is understandable without relying on color only.
- Long music metadata does not disappear too aggressively.
- The screen feels like part of the same app as Album Detail.

---

## 10. Phase 7 — Profile Polish

### Scope

Reframe Profile from "settings with stats" into "taste identity", while still keeping account/library controls available.

### Files

- `app/(tabs)/profile.tsx`
- `components/profile/TasteSection.tsx`
- `components/profile/ListeningSummary.tsx`
- `components/library/SyncBanner.tsx`
- `components/ui/Avatar.tsx`
- `lib/copy.ts`

### Tasks

1. Hero:
   - Make avatar/name/streak feel like a music identity card.
   - Add subtle brand/backdrop treatment.
   - Ensure long Spotify display names wrap safely.

2. Taste section:
   - Artist chips should feel curated, not like generic tags.
   - Decade bars should be more expressive:
     - Add labels with stronger hierarchy.
     - Consider horizontal "record shelf" bars.
     - Preserve accessibility with text counts.

3. Listening summary:
   - Stats should feel like a journal summary.
   - Avoid "avg score" feeling overly numeric if the product uses emotional ratings.
   - Consider displaying the dominant emotional label instead of or alongside average.

4. Library / connections / settings:
   - Visually subordinate operational controls.
   - `SyncBanner` should be distinguishable inside the Library card (`surface-2`, border, or icon).
   - Free/Premium badge should use the new `Badge`.
   - Hide or soften "Daily reminder time — coming soon" if it feels unfinished; better: "Daily reminder settings are coming soon" as subtle roadmap copy, or remove until implemented.

5. Sign out:
   - Ghost button is fine, but keep it visually separate from primary product content.

### Acceptance Criteria

- Profile feels personal and music-focused.
- Operational settings do not dominate.
- Empty/low-data profile still looks good after first sync.
- Long names and many artist chips wrap cleanly.

---

## 11. Phase 8 — Navigation and System Chrome

### Scope

Make the app frame feel intentional without fighting native patterns.

### Files

- `app/(tabs)/_layout.tsx`
- `components/ui/Screen.tsx`
- `app/_layout.tsx`
- `app.config.ts`

### Tasks

1. Tab bar:
   - Set explicit height and padding for iOS/Android safe areas.
   - Consider `expo-blur` background or a refined solid `surface` treatment.
   - Add active indicator or stronger icon/label hierarchy.
   - Keep 3 tabs only: Home / Discoveries / Profile.

2. Screen padding:
   - Ensure bottom content is never hidden behind tab bar.
   - Review `Screen` scroll and non-scroll modes.
   - Keep `edges={['top', 'left', 'right']}` unless bottom safe area is handled by tab bar/content padding.

3. Status bar:
   - Keep `StatusBar style="light"`.
   - Verify backdrop-heavy album screens do not put light icons over bright cover art without scrim.

### Acceptance Criteria

- Tab bar no longer looks default.
- Content has consistent top/bottom rhythm.
- Safe area is correct on iPhone with home indicator and Android gesture nav.

---

## 12. Phase 9 — Accessibility and Interaction QA

### Scope

Catch the visual bugs users experience as "this feels off".

### Files

All UI files in `app/` and `components/`.

### Tasks

1. Touch targets:
   - Back button: at least 44x44.
   - Tabs: at least 44pt high.
   - `View all` action: increase hit slop or use a 44pt wrapper.
   - Share button: already 48x48, keep.

2. Labels:
   - Icon-only buttons need `accessibilityLabel`.
   - List items should announce album, artist, date, status.
   - Rating choices should announce selected state and label.
   - TextInput should have `accessibilityLabel`, not just placeholder.

3. Dynamic type:
   - Test larger text sizes.
   - Avoid fixed-height text containers where labels can clip.
   - Prefer wrapping over truncation except in dense list rows.

4. Color and contrast:
   - Existing palette contrast is strong; re-check after any token adjustment.
   - Status should not rely only on colored dots; include labels.

5. Motion:
   - Reduce Motion disables parallax, skeleton pulse, list entrance, and press scale.
   - Haptics no-op when Reduce Motion is on, matching current helper behavior.

### Acceptance Criteria

- VoiceOver/TalkBack users can identify all core actions.
- Larger text does not make the UI unusable.
- No interaction requires a tiny precise tap.

---

## 13. Phase 10 — QA Matrix

### Static Checks

Run:

```bash
PATH=/opt/homebrew/bin:$PATH npm run typecheck
PATH=/opt/homebrew/bin:$PATH npm run lint
```

If dependencies are added:

```bash
PATH=/opt/homebrew/bin:$PATH npx expo install --check
```

### On-Device Visual QA

Use Expo Go on:

- Small iPhone viewport (iPhone SE-size or similar).
- Large iPhone viewport.
- Android device/emulator.
- System text size increased.
- Reduce Motion enabled.
- Spotify Free account if available.
- Missing/slow cover art scenario if easy to simulate.

### Screen Checklist

1. Sign-in:
   - Looks branded.
   - Spotify button aligned.
   - Loading state stable.

2. First sync:
   - Progress visible.
   - Retry visible after stale/fail.
   - No visual dead end.

3. Home album:
   - Cover loads cleanly.
   - Long title wraps safely.
   - Why-this-album readable.
   - Spotify Free notice visible but not noisy.
   - Rating save flow feels polished.

4. Discovery detail:
   - Back button safe and tappable.
   - Same album detail quality as Home.

5. Discoveries:
   - Tabs are tappable.
   - Empty/loading/error states polished.
   - Rows scan well.

6. Profile:
   - Hero looks personal.
   - Taste chips/bars wrap.
   - Library sync banner is readable.
   - Settings do not look unfinished.

7. Share:
   - PNG includes cover/title/artist/brand.
   - Long title does not overlap.
   - Missing cover fallback acceptable.

8. App shell:
   - Icon and splash match brand.
   - Tab bar feels intentional.
   - No content hidden behind safe areas.

---

## 14. Dependency and Manual Command Notes

Most of this plan can be implemented with existing dependencies. Potential additions:

- `expo-font` only if custom fonts are chosen.
- No native image color extraction library; stay with blurred cover backdrop.

If dependencies are added, the user must run:

```bash
PATH=/opt/homebrew/bin:$PATH NPM_CONFIG_LEGACY_PEER_DEPS=true npx expo install expo-font
PATH=/opt/homebrew/bin:$PATH npx expo install --check
```

Use exact dependency commands only after the implementation decision is made. Do not run plain `npm install`; this repo needs legacy peer-dep resolution for installs.

Icon/splash changes may require:

```bash
PATH=/opt/homebrew/bin:$PATH npx expo start --clear
```

For a production/native build, app icon and splash must be verified in the built app, not only in Expo Go.

---

## 15. Risks and Guardrails

1. **Over-designing the app.** Keep the product calm and music-first. Avoid decorative effects that compete with album art.
2. **Breaking Expo Go compatibility.** Avoid native modules outside SDK 54 unless explicitly approved.
3. **Generic "AI app" visuals.** No purple gradients, decorative blobs, or meaningless glass everywhere.
4. **Spotify brand misuse.** Spotify sign-in stays green with Spotify icon. Do not recolor it into the app palette.
5. **Long music metadata.** Test extreme titles/artists early, not at the end.
6. **Card overload.** Profile especially should avoid becoming a pile of identical rounded cards.
7. **Ratings contract.** Ratings remain a private journal and must not visually imply they tune recommendations.
8. **English-only v1.** Do not introduce Russian UI strings or i18n infrastructure.

---

## 16. Suggested Work Breakdown

### PR 1 — Brand Shell

- Replace icon/splash assets.
- Add `BrandMark`.
- Fix English-only 404.
- Update splash/icon config colors.

### PR 2 — UI Primitive Hardening

- Refine `Text`, `Card`, `Button`.
- Add `Badge`, `SectionHeader`, shared press behavior.
- Adjust radius/elevation conventions.

### PR 3 — First-Run Polish

- Rebuild sign-in.
- Improve OAuth callback state.
- Improve initial sync screen.

### PR 4 — Album Detail + Rating

- Long-title strategy.
- Refine cover backdrop/scrim.
- Improve actions, Free Spotify notice, rating editor.
- Update skeleton/error/waiting states.

### PR 5 — Share Card

- Redesign share card layout.
- Add adaptive text handling.
- Verify capture.

### PR 6 — Discoveries + Profile

- Polish list rows/tabs/status chips.
- Reframe Profile into taste identity.
- Subordinate settings/connection/library controls.

### PR 7 — Navigation + QA

- Tab bar refinement.
- Safe area pass.
- Accessibility pass.
- Device QA fixes.

---

## 17. Final Definition of Done

The pass is done when:

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npx expo install --check` passes if dependencies changed.
- On-device visual QA screenshots are collected for all core screens.
- App icon/splash are verified.
- Share card output is manually inspected.
- No Russian v1 UI copy remains.
- No raw palette hex is added in `app/`, `components/`, or `lib`.
- No regressions to existing product rules: no skip, no social, no ratings-as-recommendation-input, no direct ratings writes, no new tabs.
