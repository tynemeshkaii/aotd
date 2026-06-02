# Editorial Redesign — Final Consolidated Plan ("PRESS")

> **Single source of truth** for the app redesign. Consolidates every decision locked during the design
> session (companion-preview approvals) plus the implementation reality.
> Related docs: `plans/editorial-redesign.md` (earlier reconciled plan), `plans/editorial-font-fix.md`
> (the font-wiring bug), `plans/artist-country-chip.md` (the country data pipeline),
> `plans/redesign-dual-skin-ab-test.md` (the concluded bakeoff).

---

## 0. Status (what is done vs remaining)

**Done in code (verified `tsc` + `biome` clean):**
- Editorial skin built across all surfaces (Home/detail, Discoveries, Profile, Sign-in, InitialSyncing,
  ShareCard, States) via shared controllers + `components/skins/editorial/*`.
- Fonts wired correctly (see §3 — the critical fix): Archivo / Space Mono / Space Grotesk now actually apply.
- Home top-of-screen locked composition (§5) implemented: kicker → masthead `your album of the day`
  (flowing `day`) → flowing rule → ink album title overlapping the cover top → full-bleed cover with
  ink chips → genre-free spec (`·`) → `WHY THIS ONE?` rule → ink-slab `Listen on Spotify` CTA →
  ballot rating.
- Artist-country chip code present; renders when data exists, hides (year-only) when null.

**Remaining:**
1. **Artist-country data** — 0/305 albums have `artist_country` in the live DB. Chip is hidden everywhere
   until populated. Needs: deploy `compute-album-of-the-day` (fills new picks) + a one-off backfill of
   existing albums (MusicBrainz lookups). See `plans/artist-country-chip.md` §7 + §9.
2. **On-device QA** vs the companion preview (legibility of ink title over dark/busy covers, long titles,
   archive-detail header, ballot, share card).
3. **Collapse the bakeoff** — remove the `generative` skin + skin toggle + skin indirection once the
   editorial direction is accepted (§8).
4. **Commit** — all work is currently uncommitted on `main`.

---

## 1. Direction (locked)

Editorial / Swiss print poster. Sharp edges, hard rules, disciplined grid, generous negative space, the album
cover as the dominant freely-colored surface, and **one living thread — the iridescent accent — as the only
motion**. No blur / glass / glow / gradient blobs / rounded SaaS cards.

Mental model: each daily pick is a printed **issue**. Home = today's cover story. Discoveries = the archive /
contents. Profile = the colophon / listening ledger.

---

## 2. Color tokens (`components/skins/shared/skinStyles.ts`)

```
paper        #f4ebe0   root ground
paperAlt     #eadcc9   cover placeholder / skeleton base
ink          #1d1511   text, hard rules, marker fills
muted        #6f5d52   secondary mono text
rule         #1d1511   hard structural rules
accentStatic #ff4a2e   reduce-motion / share capture / fallback accent
primary      #87263b   rating tone max (sparingly)
red          #9f2637   error / destructive

accentFlow = ['#ff4a2e', '#ff2e8b', '#7b3ff2', '#d9a441', '#ff4a2e']   // iridescent, NO green
```

Rules: green stays reserved for the Spotify sign-in button only. Tags/chips are ink/paper, never accent.
Rating tones (`ratingTone`) are separate from the flowing accent.

---

## 3. Type system + the critical font-wiring rule

Three voices, registered as **named `fontFamily` utilities** in `tailwind.config.js`:

```js
fontFamily: {
  sans: ['System'],
  display: ['Archivo_800ExtraBold'],
  'display-semibold': ['Archivo_600SemiBold'],
  mono: ['SpaceMono_400Regular'],
  'mono-bold': ['SpaceMono_700Bold'],
  prose: ['SpaceGrotesk_400Regular'],
  'prose-medium': ['SpaceGrotesk_500Medium'],
  'prose-bold': ['SpaceGrotesk_700Bold'],
}
```

| Role | Class | Used for |
|---|---|---|
| Display | `font-display` (+ tight `letterSpacing` ~ -0.9…-1.2) | masthead, album title, big numerals, CTA |
| Detail / mono | `font-mono` / `font-mono-bold` | kicker, dates, spec line, labels, CTA subtitle, parenthetical asides, markers |
| Prose | `font-prose` / `font-prose-medium` / `font-prose-bold` | "why this album", ballot labels, sync/profile copy, form text |

> **CRITICAL — never use `font-[Archivo_800ExtraBold]` arbitrary classes.** Tailwind/NativeWind compiles
> `font-[…]` to **`font-weight`** (not `font-family`) and converts `_` → space, so the custom font silently
> never applies and everything falls back to the system font. This was the root cause of "the app looks
> nothing like the preview". Always go through the named `font-*` utilities above. Fonts are loaded once via
> `useSkinFonts()` (`theme/skins/fonts.ts`) and render is gated on load in `app/_layout.tsx`.

Display uses slight negative tracking for punch; mono/prose never go negative. Masthead is **lowercase**;
album title, labels, spec, markers are **UPPERCASE**.

---

## 4. Motion — the flowing accent (scarce)

`theme/skins/AccentFlowProvider.tsx` owns one Reanimated `progress` shared value, looped
`withRepeat(withTiming(1, { duration: 6000, easing: linear }), -1)`. Gated: runs only when screen focused
(`useAccentFlowFocus`) + app active + Reduce Motion off; otherwise cancelled and accent renders static
`accentStatic`.

- `AccentRule` — clipped 3×-wide `expo-linear-gradient`, animated `translateX` (flowing hairline). Static
  fallback when reduced/off.
- `AccentText` — gradient sweep via `@react-native-masked-view/masked-view` for **standalone** nodes (CTA
  `↗`); **inline-in-`<Text>` usage must use the `fallback` (interpolateColor color-cycle) path** because a
  MaskedView (a View) cannot be nested inside RN `<Text>`. The masthead `day` uses the fallback path.

**Flow applies only to:** the masthead word `day`, the hairline rules, the CTA `↗`. **Never** on the album
title, tags, list rows, prose, metadata, skeletons, errors. ≤3 animated nodes per screen.

---

## 5. Home / Album Detail — LOCKED composition

`EditorialAlbumDetailView`, top → bottom (Home `isToday` case):

1. **Kicker** — `font-mono`, muted, uppercase: `№152 · Jun 1, 2026`.
2. **Masthead** (dominant) — `font-display`, **lowercase**, tight: `your album of the day`, the word **`day`**
   is the flowing accent (`AccentText fallback`). No "Today" tag (dropped as meaningless).
3. **Flowing `AccentRule`** (thickness 3).
4. **Album title** — `font-display`, **UPPERCASE**, tight, **solid ink**. Sits above the cover; its last line
   **overlaps the cover's top sliver** (cover `marginTop: -14`, title `zIndex: 2` — cover never clipped, no
   paper box by default). Long titles wrap (≤4 lines); a per-line paper knock-out is only a legibility
   fallback on dark/busy covers. No accent on the title.
5. **Cover** — square, sharp, full-bleed to content edge, intact. Static **ink-marker chips** bottom-right:
   **release year + artist country** (`UK`/`US`/…). Country hidden when null → year-only. Scroll parallax
   stays (Reduce-Motion gated).
6. **Spec line** — `font-mono`, muted, uppercase, `·`-separated: `ARTIST · N TRACKS · DURATION`.
   **No year** (it's on the chip) and **no genre** (the product never ranks/explains by genre).
7. **Why block** — replace the old faux-editor framing with a truthful question: `WHY THIS ONE?` in
   `font-mono-bold` + a thick ink rule. Render only the reason in `font-prose` 17px below it. No muted
   duplicate muted parenthetical aside; the previous aside is removed as nonessential copy.
8. **Primary CTA — ink slab transport command**: black/ink rectangular slab, thin static gold registration
   mark at top, left sharp square play cell, right big `font-display` `Listen on Spotify` split over two
   lines. The CTA block contains no extra instructional copy. Whole slab tappable ≥56px, a11y label
   "Listen on Spotify". **Secondary** = small `font-mono-bold` `Share ↗`. Wired to
   `onOpen/onShare/opening/sharing`.
9. **Free-Spotify badge** — visible, persistent, **green-bordered** (Spotify signal; never recolored).
10. **Editorial ballot** rating editor (5 ruled rows, selected = ink fill, `font-prose-bold` labels).

**Archive detail (non-`isToday`):** compact header = back affordance + the `№/date` kicker (no masthead, no
"Today"); same ink-title-over-cover hero below.

---

## 6. Other surfaces (editorial, named fonts, scarce accent)

- **Discoveries** — `ARCHIVE` / `CONTENTS` masthead + flowing rule; filter tabs with ink-fill active state and
  an optional active `AccentRule` underline; rows = `No. NNN` issue number · small sharp cover · `font-display`
  title (≤2 lines) · `font-mono` artist/date · status ink-marker. Once-per-`aotd_id` entrance only; no flow on
  rows. Empty = "blank archive page".
- **Profile** — `COLOPHON` masthead; big `font-display` ledger numerals (streak / issues / rated); taste +
  listening as ruled ledger sections; library/connections as production notes; Free/Premium ink-marker;
  log out. (Skin-bakeoff toggle to be removed — §8.)
- **Sign-in** — poster masthead + flowing rule + `font-prose` subcopy; dedicated green `SpotifyButton`.
- **InitialSyncing** — editorial framing; indeterminate `ActivityIndicator` tinted `accentStatic`.
- **ShareCard** — standalone printable poster; **RN `Image`** (not expo-image) for `react-native-view-shot`;
  **static** accent only (never animated during capture); issue/date + title + artist + cover + `ALBUM OF THE
  DAY`; cover prefetched.
- **States** (`AlbumDetailSkeleton`/`PickError`/`WaitingForPick`/`EmptyState`/`ErrorState`) — paper/ink, sharp
  skeletons, `font-mono` labels + `font-prose` copy, no accent animation; Home still shows retryable
  `PickError` on RPC/network errors (never masked as waiting).

---

## 7. Artist-country chip dependency

Code renders chip 2 = country when `formatArtistCountry(album.album_artist_country)` is non-null, else
year-only. **Live DB currently has country for 0/305 albums**, so the chip is hidden everywhere. To populate,
follow `plans/artist-country-chip.md`:
- Deploy `compute-album-of-the-day` (fills country for new/recomputed picks via the existing
  `getArtistCountryCached` helper in `_shared/musicbrainz.ts`, endpoint `artist_lookup`, fail-open).
- One-off backfill of existing albums (MusicBrainz, throttled ~1 req/s). This requires a manual run outside
  the sandbox (network + service role).

No client change needed once data exists.

---

## 8. Collapse the bakeoff (after editorial is accepted)

- Delete `components/skins/generative/`; remove `generativeColors`.
- `theme/skins/types.ts` → `SkinId = 'editorial'` (or remove the union); drop `generative` from
  `registry.ts`; remove `SkinToggle` + the Profile "Skin bakeoff" section + `skin`/`setSkin` props.
- Optionally flatten the skin indirection (remove `SkinProvider`/`useSkin`/registry + `active_skin`
  persistence) and import editorial chrome/components directly. **Keep the shared controllers** — they keep
  product behavior out of the views.

---

## 9. Architecture map (current)

```
theme/skins/fonts.ts            useSkinFonts() loads Archivo/SpaceMono/SpaceGrotesk
theme/skins/AccentFlowProvider  one shared progress value + focus/appstate/reduce-motion gate
tailwind.config.js              named fontFamily utilities (§3) + color tokens
components/skins/shared/*Controller.tsx   data/behavior (hooks, open/share/rating/sync/oauth)
components/skins/editorial/index.tsx      all editorial views + states
components/skins/editorial/EditorialAlbumActions.tsx  ink slab transport CTA
components/skins/editorial/accent/{AccentRule,AccentText}.tsx
components/skins/editorial/{EditorialMarker,EditorialSpecLine,EditorialSectionRule}.tsx
components/skins/shared/skinStyles.ts     editorialColors + accentFlow + ratingTone
```

Data/logic hooks (`useTodayPick`, `useDiscoveries`, `useProfileOverview`, `useSaveRating`, `useOpenAlbum`,
…) are unchanged and shared. Backend untouched by the redesign itself.

---

## 10. Testing / verification

- `npm run typecheck` + `npm run lint` clean (after any change).
- `npx expo start -c` (clear Metro cache after **tailwind.config** changes so new font utilities bundle).
- On device, compare Home to the companion preview: masthead/title in Archivo, kicker/spec in Space Mono,
  why in Space Grotesk; flowing accent on `day` + rules + `↗` only; ink title legible over dark/bright/busy
  covers (else paper knock-out); long title wraps; archive-detail header; ballot; share card.
- Country chip appears once data is backfilled (verify on a freshly computed pick).
- Functional regression: open in Spotify (native + web), share (PNG + url), rate all 5 levels + microcopy,
  Free explainer awaited before open, Home `PickError` on RPC failure, OAuth/sync/`save_album_rating` intact.

---

## 11. Manual steps (sandbox can't run these)

- `npx expo start -c` to see font/tailwind changes.
- Artist-country data: `supabase functions deploy compute-album-of-the-day` + the one-off backfill
  (`plans/artist-country-chip.md`).
- Commit when satisfied (work is uncommitted on `main`).

---

## 12. Locked decisions log (from the session)

Ground = warm paper. Display = Archivo bold grotesque (not condensed/Oswald), tight tracking. Accent =
flowing iridescent gradient (chosen over solid color-cycle), no green, scarce. Tags = static ink marker
(not animated). Header = "folio→masthead" direction A: small `№/date` kicker + dominant lowercase masthead
`your album of the day` with the accent on `day`; the "Today" element was removed. Title × cover = "B · on
top" (ink title overlaps the cover top, cover never clipped). Body/prose voice = Space Grotesk (rejected
serif/Fraunces; matches electronic/experimental/brutal tags). Why block = `WHY THIS ONE?` with a thick ink
rule, not faux-editor framing; the muted parenthetical aside was removed. Primary CTA = ink slab transport
command with left play cell + `Listen on Spotify` only (no extra CTA microcopy). Second cover chip = artist
country (replaces rating/status), year-only when null. Spec line = `·`-separated, no year, no genre.
