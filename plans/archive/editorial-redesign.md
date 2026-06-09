# Editorial Redesign — Implementation Plan ("PRESS")

> **Status:** Partially implemented. Codex shipped the skin infra, primitives, fonts, and most surfaces; the
> **Home top-of-screen rework (§8.1) is the main pending piece**. The artist-country chip (§8.0 item 5) is
> implemented per `plans/artist-country-chip.md`.
> **Supersedes the bakeoff:** `plans/redesign-dual-skin-ab-test.md` is concluded. The on-device A/B chose
> **A · Editorial/Swiss**. The `generative` skin is shelved from the shipping app.
> **Backend:** Zero changes. Client/presentation only.
> **Reference direction:** Turner Contemporary "what's on" screen, Swiss print posters, newspaper contents
> pages, record-shop handbills: bold grotesque mastheads, mono detail voice, hard rules, sharp imagery,
> type intersecting images, arrow text-link CTAs, parenthetical mono asides.
>
> **Reconciliation note (this revision):** Codex revised and implemented an earlier draft. The implementation
> is technically faithful (accent system, primitives, fonts, masked-view all present) but drifted from the
> agreed visual intent in the **Home top-of-screen composition and typography**. This revision **keeps Codex's
> genuinely useful additions** (objective + success criteria, the Art Direction section, the concrete grid
> system, the genre-free spec line, primitive extraction, the AppState/focus motion gate, phased bakeoff
> cleanup, the fixture gallery) and **re-locks the design decisions** made in the design session. Where this
> document and the shipped code disagree, **§8.0 (Locked Home Composition) and §8.1 (Corrections to shipped
> code) win.**
>
> **Overrides to earlier rules in this doc:**
> 1. Display type **may use slight negative tracking** (~ -0.022em to -0.03em on masthead/title/big numerals).
>    The "no negative tracking" rule is removed — the approved mockups depend on tight tracking for punch.
> 2. **Album titles are set UPPERCASE** for the poster hero (not "preserve casing"). The masthead is lowercase.
> 3. Primary CTA copy is **`LISTEN ↗`**, not "Open in Spotify", rendered as a giant type command (§8.0).

---

## 1. Objective

Make the app feel like a beautiful, editorial music object: strict, printed, collectible, and a little
alive. The redesign should make the product more memorable without changing the product model, backend,
recommendation behavior, rating contract, OAuth, sharing flow, or Spotify semantics.

The visual target is **Editorial / Swiss print poster**, not a generic "magazine card UI".

Success criteria:

- Home feels like today's poster/issue, not a feed item.
- Discoveries feels like an archive contents page.
- Profile feels like a colophon/listening ledger.
- The album cover remains the dominant freely-colored surface.
- Motion is scarce and intentional: only the accent is alive.
- All existing functional states remain obvious, tappable, accessible, and regression-safe.

---

## 2. Locked Design Decisions

| Dimension | Decision |
|---|---|
| Direction | Editorial / Swiss print poster. Sharp edges, hard rules, left-aligned, disciplined grid, generous negative space. Zero blur/glass/glow. |
| Ground | Warm paper `#f4ebe0`. Ink `#1d1511`. |
| Display / mastheads | **Archivo 800 ExtraBold**, normal width, **slight negative tracking (~ -0.022em to -0.03em)** on big sizes. Header masthead is **lowercase**; album title, section titles, issue numbers are uppercase. |
| Detail / mono | **Space Mono** 400 / 700, uppercase, slightly letter-spaced. Used for labels, dates, issue numbers, metadata, CTA labels, parenthetical asides. |
| Prose | **Space Grotesk** 400 / 500 / 700. Used for "why this album", nudges, explanatory copy, form text. |
| Album titles | **UPPERCASE** poster hero, Archivo 800, tight. Sits above the cover and its last line overlaps the cover's top sliver (type-on-art, cover never clipped). Solid **ink** — no flowing accent on the title. |
| Accent | Flowing no-green iridescent gradient. Applied only to scarce hero chrome. Reduce Motion / still surfaces use static `#ff4a2e`. |
| Tags / badges | Static ink marker: solid ink fill, paper text. Never animated. |
| Cover art | Sharp, unrounded, strongly framed. The album cover is the primary visual color field. |
| CTAs | Primary = **giant type command `LISTEN ↗`** (Archivo, ink, flowing-accent arrow) + mono subtitle `on spotify · play the record`, over a flowing rule; whole block tappable, ≥56px. Secondary = small mono `share ↗`. Not rounded pills, not green (green stays reserved for the sign-in `SpotifyButton`). |

---

## 3. Beauty Pass / Art Direction

This section is the visual north star. The implementation should not merely restyle existing app blocks; it
should make each surface feel like a designed music artifact.

### Home As Today's Poster

Home should read as the current issue/poster of the app.

- The first impression is cover + title + issue/date, not a stack of generic controls.
- The album cover is oversized and treated as a print image plate.
- The album **title** (solid ink) intersects the cover's top edge — the signature poster moment. The single flowing-accent word lives in the **masthead** (`day`), not on the cover (see §8.0).
- Metadata becomes a strict mono spec line, like print catalog copy.
- The primary Spotify action feels like a typographic command line, not a filled app button.
- The "Why this album" block should feel like an editor's note: warm, brief, and low-pressure.

### Discoveries As Archive Contents

Discoveries should feel like flipping through a record archive, not browsing cards.

- Rows behave like a contents page: issue number, date, artist, title, status.
- Covers are small, sharp image plates with enough negative space around them.
- Filters feel like printed tabs or section labels, with only the active underline allowed to use accent flow.
- Empty/error states should preserve the archive metaphor: blank page, missing issue, retry stamp.

### Profile As Colophon / Listening Ledger

Profile should feel like the back page of a publication and a personal listening ledger.

- Big numerals are typeset like issue statistics, not dashboard widgets.
- Taste/listening summaries become ledger rows, ruled sections, or compact print tables.
- Connections and sync status should feel like production notes, not settings cards.
- Sign out can remain utilitarian, but it should still obey the paper/ink/mono language.

### Rating As Editorial Ballot

The rating editor should feel like a printed response form or critic's ballot.

- Keep the five emotional labels exactly; do not introduce stars, sliders, or emoji-primary visuals.
- Each option can be a ruled row, stamp, or ballot mark.
- Selected state may use the existing `ratingTone`, but should still feel printed and sharp.
- The first-rating microcopy should read like a small editorial footnote: ratings are for journal/stats/sharing,
  not recommendation tuning.

### ShareCard As Printable Poster

The share card should not look like a screenshot of the app. It should be a standalone artifact someone would
want to post.

- Include `ALBUM OF THE DAY`, issue/date, artist, title, cover, and static accent.
- Use stronger poster composition than the in-app layout if needed.
- Treat missing artwork as an intentional placeholder plate, not a broken image state.
- Freeze all motion; share output is print, not UI.

### Anti-Generic Rules

- No nested cards, glossy panels, glass, glow, blur, gradient blobs, or generic SaaS dashboard patterns.
- No decorative color blocks beyond cover art and the scarce accent system.
- Do not let old rounded primitives leak into the final editorial screens.
- If a screen starts to look like "cards on a beige background", return to rules, grid, type, and image plates.

---

## 4. Grid And Layout System

The plan must define numbers, because Swiss/poster design falls apart without a grid.

### Base Measurements

- **Screen padding:** 20px on standard phones, 24px on wider devices.
- **Grid:** 4-column content grid with 12px gutters inside the screen padding.
- **Baseline unit:** 4px. All vertical spacing should be multiples of 4.
- **Primary section gaps:** 24px / 32px / 48px.
- **Inline gaps:** 8px / 12px / 16px.
- **Structural rules:** 2px ink for major dividers; 1px ink for dense metadata rows; 2px accent for flowing hero rules.
- **Frames:** 2px ink frame around major art surfaces when needed. No border radius on editorial surfaces.

### Cover Treatment

Use two cover modes:

- **Hero bleed:** Home/detail cover may extend to the content column edge and can intentionally intersect with type.
- **Archive frame:** Discoveries/Profile covers stay inside the grid, sharp and framed.

Avoid saying "full-bleed within 20px margin"; use "bleed to content column edge" unless an element truly reaches
the viewport edge.

### Text Over Image

The **album title** (solid ink) intersects the cover: its last line straddles **paper + image** at the cover's
top edge, never sitting entirely on a busy image. The cover is not clipped. If legibility fails on a dark/busy
cover, use a per-line paper knock-out strip or ink overprint. Do **not** add glow, blur, or soft halo; those
fight the print-poster direction. The flowing accent is **not** used here — it stays on the masthead `day`,
the rules, and the CTA arrow.

### Long Content Rules

- Long album titles may wrap to 2-4 lines on detail screens.
- List rows clamp album titles to 2 lines and artist/spec lines to 1 line.
- CTA text must never shrink below a readable size; wrap secondary affordances before shrinking primary action.
- Three-digit issue/streak numbers must fit without pushing adjacent content.
- Dynamic Type / large font settings may reduce decorative overlap before they reduce readability.

---

## 5. Type System

Three voices, no fourth. Fonts load once through `theme/skins/fonts.ts` via `expo-font` `useFonts`.

| Role | Font | Weights | Used for |
|---|---|---|---|
| Display | `Archivo` | `800ExtraBold`, `600SemiBold` | Masthead, screen titles, album display title, masthead accent word (`day`), big numerals |
| Detail / mono | `Space Mono` | `400Regular`, `700Bold` | Kickers, dates, durations, track counts, issue numbers, CTA labels, archive metadata, parenthetical asides |
| Prose | `Space Grotesk` | `400Regular`, `500Medium`, `700Bold` | "Why this album", low-pressure nudges, sync/profile copy, form text |

NativeWind font tokens after install:

```
font-[Archivo_800ExtraBold]
font-[Archivo_600SemiBold]
font-[SpaceMono_400Regular]
font-[SpaceMono_700Bold]
font-[SpaceGrotesk_400Regular]
font-[SpaceGrotesk_500Medium]
font-[SpaceGrotesk_700Bold]
```

Rules:

- Do not rely on system font inside editorial surfaces.
- Display sizes (masthead, album title, big numerals) use **slight negative tracking ~ -0.022em to -0.03em** for punch. Body/mono never go negative.
- Mono labels may use small positive `letterSpacing`.
- Labels, spec lines, CTAs subtitle, status markers, album title: uppercase. **Header masthead (`your album of the day`) is lowercase.**
- Album titles: **UPPERCASE** (the poster hero), no flowing accent.
- Body copy: sentence case, Space Grotesk, never mono for paragraphs.

Migration:

- Replace `font-[Oswald_700Bold]` in `components/skins/editorial/index.tsx` with Archivo.
- Add explicit Space Grotesk classes to prose text that currently has no font class.
- Remove `@expo-google-fonts/oswald` after `rg "Oswald"` returns no app usage.

---

## 6. Color Tokens

Update `components/skins/shared/skinStyles.ts` `editorialColors`:

```
paper        #f4ebe0   root ground
paperAlt     #eadcc9   cover placeholder, skeleton base
ink          #1d1511   text, hard rules, marker fills
muted        #6f5d52   secondary mono text
rule         #1d1511   hard structural rules
accentStatic #ff4a2e   reduce-motion, still capture, fallback accent
primary      #87263b   rating seal max, sparingly
onPrimary    #fff6e8   legacy compatibility while old Button paths exist
red          #9f2637   error/destructive
```

Add a no-green accent palette:

```
accentFlow = ['#ff4a2e', '#ff2e8b', '#7b3ff2', '#d9a441', '#ff4a2e']
```

Rules:

- Green remains reserved for Spotify only.
- Rating tones stay separate from the flowing accent.
- Tags/badges are ink/paper, not accent.
- Use the album cover for color richness; do not add decorative color blocks to compensate.

---

## 7. Motion — The Flowing Accent

Concept: the page is printed and strict, but the accent behaves like wet ink catching light.

Scarcity is mandatory. Max ~3 animated accent nodes per screen.

### Flow Applies To

- Primary hairline rule under masthead/header.
- The **masthead accent word (`day`)** on Home — **not** on the cover (the album title is solid ink).
- Arrow CTA glyph/rule treatment.
- Optional active filter underline on Discoveries, one at a time.

### Flow Never Applies To

Tags, badges, list rows, prose text, metadata, rating marks, skeletons, error states, loading placeholders.

### Architecture

- `theme/skins/AccentFlowProvider.tsx` owns one Reanimated `progress` shared value and exposes
  `useAccentFlow()`.
- Add a screen-level focus gate rather than putting navigation focus inside the provider:
  - active screen + Reduce Motion off + app active -> run loop
  - unfocused/backgrounded/Reduce Motion on -> cancel/pause loop
- Loop:

```
withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1)
```

- Reduce Motion: do not start the loop. Render static `accentStatic`.
- AppState backgrounding: pause/cancel the loop to save battery.

### Components

- `components/skins/editorial/accent/AccentRule.tsx`
  - Clipped `View` containing a 3x-wide `expo-linear-gradient`.
  - Animated `translateX` from `progress`.
  - Static solid/gradient fallback for Reduce Motion and share capture.

- `components/skins/editorial/accent/AccentText.tsx`
  - Primary path: `@react-native-masked-view/masked-view` + animated `expo-linear-gradient`.
  - Fallback path: `Animated.Text` with `interpolateColor(progress, inputRange, accentFlow)`.
  - Print-safe legibility fallback: paper knock-out strip or ink overprint if cover contrast fails.

All action taps keep existing `lib/haptics` conventions, and all animation honors `lib/motion.ts` /
`useReduceMotion()`.

---

## 8. Editorial Language By Surface

### Home / Album Detail — §8.0 LOCKED COMPOSITION (source of truth)

This is the exact, decided top-of-screen for `EditorialAlbumDetailView`. Build the Home (`isToday`) case to
this spec; the archive-detail case differs only in the header (see end).

Top-to-bottom:

1. **Kicker** (Space Mono, muted, ~8.5px, tracked, uppercase): `№142 · Sat 31 May 2026`. Small, on top.
2. **Masthead — the dominant header element** (Archivo 800, **lowercase**, tight `-0.026em`, wraps 2 lines):
   `your album` / `of the day`. The single word **`day`** is the flowing `AccentText`. This carries the
   "daily" meaning — there is **no separate "Today" tag** (it was dropped as meaningless).
3. **Flowing `AccentRule`** (hairline) directly under the masthead.
4. **Album title — poster hero** (Archivo 800, UPPERCASE, tight `-0.024em`, **solid ink**): sits above the
   cover; its **last line overlaps the cover's top sliver (type-on-art; the cover is NEVER clipped)**. The
   title floats on top of the artwork — do **not** put a paper box behind it by default. Long titles wrap
   (up to ~3–4 lines); the last word kisses the cover top. A per-line **paper knock-out** strip is only a
   fallback when a dark/busy cover region genuinely kills contrast. **No flowing accent on the title.**
5. **Cover**: square, sharp (no radius), bleeds to the content-column edge, **full / intact** (it is the
   dominant freely-colored surface). **Ink-marker chips** bottom-right — solid ink fill, paper text, static:
   **release year + artist country** (`UK`/`US`/…). Country is implemented (`plans/artist-country-chip.md`):
   render it when present, **hide the country chip when null → year-only** (never `??`). Status is dropped
   from the cover (it stays on Discoveries rows). Keep the existing scroll parallax (Reduce-Motion gated).
6. **Spec line** (Space Mono, muted, uppercase): `ARTIST · YEAR · TRACKS · DURATION`. **No genre field** —
   the product never ranks or explains by genre taxonomy (real data only).
7. **Editor's note ("why this album")**: Space Grotesk, plain-language, low-pressure, + a Space Mono muted
   parenthetical aside, e.g. `( from artists you keep saving )`.
8. **Primary CTA — giant type command** (replaces the quiet arrow link): over a flowing `AccentRule`, a big
   Archivo `LISTEN` with a flowing-accent `↗`, and a Space Mono subtitle `on spotify · play the record`.
   The whole block is one tappable target, ≥56px. Wire to `props.onOpen`; keep `opening` state. Accessibility
   label stays explicit, e.g. "Listen on Spotify". **Secondary** = small mono `share ↗` → `props.onShare`.
9. **Free Spotify badge**: visible, persistent, **green-bordered** as a Spotify signal — do not recolor to
   the brand accent.

**Accent scarcity on Home (the whole point):** the only flowing nodes are the masthead word **`day`**, the
**hairline rules**, and the **CTA `↗`** (one shared flow phase). Title = ink. Chips = ink. List rows, spec,
why, badges = never flow. Reduce Motion / off-screen → everything static `accentStatic`.

**Archive-detail header (non-`isToday`):** drop the "your album of the day" masthead; use a compact header =
back affordance + the issue/date kicker (`№139 · 28 May 2026`) + the same ink-title-over-cover hero. Do not
label it "Today".

### §8.1 Corrections to the shipped implementation (Home drift fix)

The shipped `EditorialAlbumDetailView` in `components/skins/editorial/index.tsx` is where the drift lives.
Apply these concrete edits to reach §8.0:

1. **Remove the big `"Today's Record" / "Archive Record"` 48px headline** and the separate red **`Today`**
   marker. Replace the header with: kicker (`№{issueNo} · {date}`) + lowercase masthead `your album of the
   day` where `day` is `AccentText`. Keep the `№{issueNo}` in the kicker. (Archive-detail: compact header,
   no masthead — see §8.0.)
2. **Delete the `accentWord()` overlap.** Currently it picks a quasi-random 3–9-char word and floats it on a
   paper knock-out at the cover **bottom** (`-bottom-5`, `bg paper`). Remove this entirely.
3. **Move the album title above the cover**, UPPERCASE Archivo 800 tight ink, and position it so its **last
   line overlaps the cover top sliver** (negative margin between title and cover, title `zIndex` above,
   cover not clipped). No paper box by default; knock-out only as a per-line legibility fallback.
4. **Remove the `border-2 p-2` framed box around the cover.** Cover bleeds to the content-column edge, sharp,
   full. Add static **ink-marker chips** (`EditorialMarker`) bottom-right of the cover: **year + artist
   country** (country implemented per `plans/artist-country-chip.md`; hide country when null → year-only).
   Do not put the status/rating on the cover.
5. **Replace `EditorialAlbumActions`** (current quiet arrow link) with the **giant `LISTEN ↗` type command**
   (§8.0 item 8): flowing rule on top, big Archivo `LISTEN` + flowing `↗`, mono subtitle `on spotify · play
   the record`, whole block tappable ≥56px, `share ↗` as the small secondary. Keep `onOpen/onShare/opening/
   sharing` wiring. Rename the visible verb Open→**Listen** (accessibility label "Listen on Spotify").
6. **Add negative tracking** (`letterSpacing` ~ -0.022em…-0.03em) to masthead, album title, and big numerals
   (`LedgerStat` numbers too). Masthead lowercase; title uppercase.
7. Keep the genre-free `EditorialSpecLine`, the Space-Grotesk "why" + parenthetical aside, and the
   green-bordered Free-Spotify badge as already shipped.

The other surfaces Codex shipped (Discoveries archive rows, Profile colophon/ledger, sign-in, states,
share card) are broadly on-spec; apply the same locked principles (lowercase masthead voice, tight tracking,
scarce accent, `LISTEN` verb on the detail CTA) but they do not need the Home-level rework.

### Discoveries

Goal: archive contents.

- Masthead: `ARCHIVE` / `CONTENTS`.
- Filter tabs: black-fill active state; optional active `AccentRule` underline only.
- Rows:
  - `No. 141` issue number.
  - Small sharp cover.
  - Title in Archivo, max 2 lines.
  - Artist + pick date in Space Mono.
  - Status as ink marker or mono label.
- Rows do not continuously animate. Keep only the once-per-`aotd_id` entrance.
- Empty state should feel like a blank archive page, not a generic app empty card.

### Profile

Goal: colophon/listening ledger.

- Masthead: `COLOPHON`.
- Big Archivo numerals for streak/discovered/rated.
- Taste/listening sections should become ledger/table-like, not card-heavy.
- Restyle or wrap `TasteSection` / `ListeningSummary` instead of letting generic UI leak into the screen.
- Library status, Connections, Free/Premium badge, Sync, Sign out remain.
- Remove the "Skin bakeoff" section and `SkinToggle` after visual QA accepts the editorial direction.

### Sign-In

- Poster-like masthead.
- `AccentRule`.
- Space Grotesk subcopy.
- Dedicated `SpotifyButton` stays green and unrecolored.

### Initial Syncing

- Editorial framing.
- `ActivityIndicator` is acceptable here; tint `accentStatic`.
- Copy stays calm and functional.

### ShareCard

Goal: standalone printable poster, not a screenshot-like app fragment.

- Keep RN `Image`, not `expo-image`, for `react-native-view-shot`.
- Use static accent only; never animated during capture.
- Include issue/date, artist, title, cover, and `ALBUM OF THE DAY`.
- Prefetch cover before capture, preserving existing behavior.

### States

`AlbumDetailSkeleton`, `PickError`, `WaitingForPick`, `EmptyState`, `ErrorState`:

- Paper/ink.
- Sharp skeletons, no rounded glossy placeholders.
- Space Mono labels + Space Grotesk explanatory copy.
- No accent animation in skeletons or errors.
- Home must still show retryable `PickError` on RPC/network errors; do not mask failures as waiting.

---

## 9. Components And Architecture

The current editorial surface lives mostly in `components/skins/editorial/index.tsx`. It should not become a
larger single-file design blob.

Create focused editorial subcomponents as needed:

```
components/skins/editorial/accent/AccentRule.tsx
components/skins/editorial/accent/AccentText.tsx
components/skins/editorial/EditorialAlbumActions.tsx
components/skins/editorial/EditorialMarker.tsx
components/skins/editorial/EditorialSpecLine.tsx
components/skins/editorial/EditorialSectionRule.tsx
```

Keep the shared controllers:

```
components/skins/shared/AlbumDetailController.tsx
components/skins/shared/DiscoveriesController.tsx
components/skins/shared/ProfileController.tsx
components/skins/shared/SignInController.tsx
components/skins/shared/InitialSyncingController.tsx
```

Those controllers preserve behavior and make the visual views easier to test.

---

## 10. Collapse The Bakeoff

Do this after the editorial visual pass is accepted, not before. This avoids mixing visual bugs with
architecture cleanup.

### Phase A — Keep Registry, Ship Editorial

- Keep the registry temporarily with a single effective skin.
- Remove `SkinToggle` from Profile UI.
- Stop exposing skin choice to users.
- Keep `app/skin-fixtures.tsx` temporarily as an editorial fixture gallery for QA.

### Phase B — Cleanup

- Delete `components/skins/generative/`.
- Remove `generativeColors` from `components/skins/shared/skinStyles.ts`.
- `theme/skins/types.ts`: either `SkinId = 'editorial'` or remove `SkinId` entirely.
- `theme/skins/registry.ts`: drop `generative`.
- Recommended final cleanup: flatten routers to import editorial components/chrome directly and remove:
  - `theme/skins/SkinProvider.tsx`
  - `theme/skins/useSkin.ts`
  - `theme/skins/registry.ts`
  - `active_skin` SecureStore persistence
- Remove `skin` / `setSkin` from `ProfileViewProps` and `ProfileController`.
- Replace skin-driven app chrome in `app/_layout.tsx` and `app/(tabs)/_layout.tsx` with editorial constants.

Keep the shared controller/view-contract split unless a later refactor has a better boundary.

---

## 11. Dependencies And Manual Install

Run from the repo root, in order. `expo install` invokes npm under the hood, so keep the legacy peer-deps
flag per this repo's dependency rule.

```
PATH=/opt/homebrew/bin:$PATH NPM_CONFIG_LEGACY_PEER_DEPS=true npx expo install \
  @expo-google-fonts/archivo @expo-google-fonts/space-grotesk \
  @react-native-masked-view/masked-view
PATH=/opt/homebrew/bin:$PATH npx expo install --check
```

Notes:

- `@expo-google-fonts/archivo`, `@expo-google-fonts/space-grotesk`: JS-only, Expo Go safe.
- `@react-native-masked-view/masked-view`: primary path for flowing gradient text. If Expo Go/device testing
  exposes issues, use the `interpolateColor` fallback and remove/skip the dependency.
- `expo-font`, `@expo-google-fonts/space-mono`, `expo-linear-gradient`: already installed.
- `@expo-google-fonts/oswald`: remove only after migration and grep confirmation.

---

## 12. Build Sequence

Each step should end runnable.

1. **Install fonts + update tokens.**
   - Add Archivo / Space Grotesk to `theme/skins/fonts.ts`.
   - Update `editorialColors`.
   - Replace Oswald usages with Archivo.
   - Add Space Grotesk to prose.
   - Verify app renders with new fonts and no missing glyph boxes.

2. **Add grid helpers and editorial primitives.**
   - Add small reusable primitives for rules, markers, spec lines, and section labels.
   - Refactor `components/skins/editorial/index.tsx` only enough to avoid uncontrolled growth.

3. **Build flowing accent system.**
   - Add `AccentFlowProvider`, `AccentRule`, `AccentText`.
   - Add screen-level focus/AppState/Reduce Motion gate.
   - Validate MaskedView; keep fallback ready.
   - Use it first only in masthead rule + CTA.

4. **Elevate AlbumDetail/Home — to §8.0 + apply §8.1 corrections.**
   - Kicker + lowercase masthead `your album of the day` with accent `day`; drop the big "Today's Record"
     label and the "Today" marker.
   - Sharp full-bleed cover (remove the framed box); ink-marker chips bottom-right.
   - Album title UPPERCASE ink above the cover, last line overlapping the cover top (no accent word, no
     random-word overlap).
   - Giant `LISTEN ↗` type-command CTA (+ `share ↗`); rename Open→Listen.
   - Genre-free spec line: artist/year/tracks/duration.
   - Negative tracking on display; editorial rating editor (ballot) treatment.

5. **Elevate Discoveries.**
   - Archive/contents masthead.
   - Issue-number rows.
   - Sharp covers.
   - Editorial filter tabs and empty/error states.

6. **Elevate Profile.**
   - Colophon/ledger composition.
   - Restyle taste/listening/status sections.
   - Remove visible Skin bakeoff UI.

7. **Elevate Sign-in, InitialSyncing, ShareCard, and states.**
   - ShareCard becomes a static printable poster.
   - Loading/error/waiting states match editorial system.

8. **Editorial fixture gallery QA.**
   - Keep/update `app/skin-fixtures.tsx`.
   - Include dark, bright, busy, monochrome, missing artwork, long title, long artist, rated/unrated/opened.

9. **Collapse bakeoff architecture.**
   - Delete generative skin and remove skin persistence/registry only after visual QA passes.

10. **Polish and QA.**
   - Run technical checks.
   - Verify on device.
   - Fix type overlap, long-copy, accessibility, and share capture issues.

---

## 13. Testing Plan

### Pre-Flight

- `npm run typecheck`
- `npm run lint`
- `PATH=/opt/homebrew/bin:$PATH npx expo install --check`
- `PATH=/opt/homebrew/bin:$PATH npx expo-doctor`
- `PATH=/opt/homebrew/bin:$PATH npx expo start -c`

### Device / Expo Go

- No red box.
- No missing glyph boxes.
- No React/RN version mismatch.
- New fonts load before editorial UI appears.

### Flowing Accent

- Accent flows smoothly on sanctioned nodes only.
- Reduce Motion ON freezes to static `#ff4a2e`.
- Backgrounding/switching tabs pauses loop; returning resumes.
- MaskedView path renders correctly or fallback is intentionally selected.
- No skeleton/error/list-row motion.

### Readability / Contrast

- Ink on paper meets comfortable body contrast.
- Paper-on-ink markers remain readable.
- Accent word remains legible on dark, bright, busy, monochrome, and missing covers.
- If accent-over-cover fails, switch to paper knock-out/ink overprint rather than glow.

### Type And Layout

- Dynamic Type / large font settings do not clip, overlap, or hide actions.
- Long title and long artist fixtures remain usable.
- CTA touch targets stay >= 44px.
- `↗`, parentheses, ampersands, apostrophes, and long punctuation render in the chosen fonts.

### Functional Regression

- Home: loading skeleton, waiting, retryable pick error, success.
- Album detail: loading, not found, error, success, rated/unrated.
- Discoveries: loading, empty, error, All/Unrated/Rated, Opened badge.
- Profile: overview/streak/taste/listening, sync states, Free/Premium badge, sign out.
- Actions: Open in Spotify native + web fallback, Share PNG + text/url, rate all 5 levels.
- First-rating microcopy still appears and remains best-effort.
- Spotify Free explainer is awaited before opening Spotify.
- OAuth bootstrap, library sync, `save_album_rating`, and forward-only status updates still work.

### Share Capture

- Cover is prefetched.
- Capture includes cover, title, artist, issue/date, and static accent.
- iOS `Share.share` still sends image + text/url.
- Other platforms still use `expo-sharing.shareAsync`.
- Missing artwork renders an intentional poster placeholder.

---

## 14. Manual Steps

No Supabase migration, Edge Function deploy, or DB type regeneration is required.

Required manual commands after dependency changes:

```
PATH=/opt/homebrew/bin:$PATH NPM_CONFIG_LEGACY_PEER_DEPS=true npx expo install \
  @expo-google-fonts/archivo @expo-google-fonts/space-grotesk \
  @react-native-masked-view/masked-view
PATH=/opt/homebrew/bin:$PATH npx expo install --check
PATH=/opt/homebrew/bin:$PATH npx expo start -c
```

Order matters:

1. Install dependencies first so Metro can resolve fonts/masked-view.
2. Run `expo install --check` to verify Expo SDK 54-compatible package versions.
3. Clear Metro cache so the new font bundle is picked up.

---

## 15. Open Risks

- **MaskedView in Expo Go:** primary path for gradient text may misbehave on some devices. Keep
  `interpolateColor` fallback.
- **Accent over real covers:** worst-case art can break legibility. Prefer composition/knock-out fixes over
  glow effects.
- **Single-file bloat:** `components/skins/editorial/index.tsx` is already large. Extract primitives during
  the pass.
- **Bakeoff cleanup risk:** do visual redesign first, architecture deletion second.
- **Generic shared components:** `TasteSection`, `ListeningSummary`, `Badge`, and `AlbumActions` can leak the
  old rounded app look. Restyle or wrap deliberately.
- **Scope creep on motion:** more animated accent nodes will make the design feel less printed. Keep scarcity.
- **Genre temptation:** do not add genre taxonomy to metadata or explanation unless the product model changes.
