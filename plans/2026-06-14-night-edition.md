# Night Edition — palette layer + edition toggle (sub-plan of C1)

> Sub-plan of `plans/2026-06-14-editorial-design-overhaul.md` §5 C1. Deepens the dark "evening edition." Execute with `superpowers:executing-plans`. **Depends on A0** (the `index.tsx` split) being done first — per-file migration is far safer against split views.

**Status:** Approved direction, not started. Authored 2026-06-14.

---

## The finding that de-risks this

Editorial surfaces apply color via **inline `style={{ color: editorialColors.x }}`**, not via NativeWind semantic color classes. Evidence: `editorialColors` is referenced ~150× in `components/skins/editorial/index.tsx` and across ~10 files, all dot-access into inline styles; a grep for `(bg|text|border)-(bg|surface|...|ink|paper)` color classes in the editorial/shared dirs returns **nothing**. NativeWind classes used by the skin are **structural** (`flex`, `border-2`, `px-4`, `text-xl`), and color comes from the inline import.

**Consequence:** Night Edition is mostly a mechanical swap of the color *source* — static import → palette hook — with **no Tailwind color-class rewrites** on editorial surfaces. The hook approach (not NativeWind `dark:`) is correct precisely because the colors are inline.

A small residue still uses `theme/colors.js` → Tailwind classes in **`components/ui/*` primitives** (Text default color, Button, Skeleton base `surface-2`). Those need a secondary path (NativeWind `colorScheme`) for `system`/night — handled in N3.

---

## Architecture

### Palettes (`components/skins/shared/skinStyles.ts`)

- [ ] Rename the current object to `dayPalette` and keep `export const editorialColors = dayPalette` for back-compat during migration (so unmigrated files keep compiling).
- [ ] Add `nightPalette` with the **same keys**:

```
paper:        #17120f   (warm near-black)
paperAlt:     #221a14   (raised surface / skeleton base)
ink:          #f0e6d8   (bone — primary text/strokes)
muted:        #9a8a7a   (secondary)
rule:         #f0e6d8   (= ink)
accent:       #ff5a3c   (brighter coral, reads on dark)
accentStatic: #ff5a3c
primary:      #b8485c   (tuned maroon for night)
onPrimary:    #fff6e8
red:          #cf5b6d   (stamp red, night-tuned)
```

- [ ] `ratingTone` (gold ballot tones) — add a `ratingToneNight` variant (slightly brighter golds) OR fold tone selection into the palette. `accentFlow` (masked-text gradient) reads fine on dark; keep one shared array.
- [ ] Export a `Palette` type (the key set) so consumers are type-checked.

### Provider + hook (`theme/skins/EditorialThemeProvider.tsx`)

Mirror `theme/skins/AccentFlowProvider.tsx` (single shared context, app-state aware).

- [ ] Context value `{ edition: Edition; palette: Palette; setEdition: (e: Edition) => void }`, `Edition = 'day' | 'night' | 'system'`.
- [ ] Resolve active palette: `night` → nightPalette; `day` → dayPalette; `system` → `useColorScheme()` (`'dark'` → night). Default `system`.
- [ ] Persist the choice in **AsyncStorage** (`editorial-edition` key) — a theme preference is not a "tiny best-effort flag," so AsyncStorage, not SecureStore. Hydrate on mount; render day until hydrated to avoid a flash, or gate behind the existing boot gates.
- [ ] `export function useEditorialPalette(): Palette`. Optional `useEdition()` for the toggle.
- [ ] Mount the provider in `app/_layout.tsx` **above `RouterGuard`** but inside the font/session gates so boot splash can read it.

---

## Migration phases (each independently shippable, zero-visual until N4)

### N1 — palettes + provider + hook (no consumer changes)

- [ ] Add `dayPalette`/`nightPalette`/`Palette`, provider, hook. Mount provider. **No component reads the hook yet**; `editorialColors` still resolves to day. Visual diff = zero.
- [ ] Validation: `rtk tsc && rtk lint`; app looks identical.

### N2 — migrate core surfaces (album, archive, profile)

- [ ] In each post-A0 view file, add `const palette = useEditorialPalette();` at the top of the component and replace `editorialColors` → `palette`. Sub-components inside the same file: call `useEditorialPalette()` in each component that paints (they are components), or pass `palette` as a prop to tiny stateless leaf renderers — prefer the hook in components, props only for pure helpers.
- [ ] Keep the resolved-color access localized (one `palette` per component) so a reviewer can verify each file mechanically.
- [ ] Validation per file: `rtk tsc && rtk lint`; toggle a temporary debug default to night and eyeball that file's surface; revert default to day before commit.

### N3 — migrate the rest + the NativeWind residue

- [ ] Migrate sign-in, initial-syncing, states/skeletons, sync banners, boot splash (`BootSplash`/`BrandMark` path in `app/_layout.tsx`), masthead (from A1) to the hook.
- [ ] **Skeletons**: ensure `Skeleton` base uses the active `paperAlt` (night skeletons must not be light). If `Skeleton` is a `components/ui` primitive reading a Tailwind class, drive it inline from the palette on editorial surfaces or add a night-aware base.
- [ ] **NativeWind residue** (`components/ui` Text/Button defaults, any class-based color): for `system`/night, also set NativeWind's `colorScheme` via `useColorScheme`/`Appearance` from the provider so class-based colors flip. Add `dark:` variants in `tailwind.config.js` only for the handful of semantic classes that actually appear on screen in both editions; do not blanket-add. (Most editorial color is inline, so this set is small — audit before adding.)
- [ ] **ShareCard capture edition = always Day.** Shared PNGs live outside the app's dark context; capturing night would hurt legibility. Force the off-screen capture target to `dayPalette` (wrap it so its `useEditorialPalette` resolves day, e.g. a `forceEdition` prop on the provider or pass `dayPalette` explicitly to `ShareCard`). Document this. (Re-evaluate only if the owner explicitly wants night share cards.)
- [ ] Validation: `rtk tsc && rtk lint`; sweep every screen + `app/skin-fixtures.tsx` with a forced-night default; confirm no element stays half-light (the classic theme bug). Capture a share PNG and confirm it renders Day regardless of in-app edition.

### N4 — toggle UI + persistence + system follow

- [ ] Profile "Edition" control: a segmented ink/paper selector (Day / Night / System), styled editorial (not a generic OS switch). Spotify green stays green in both editions. Place in the quieter operational area of Profile (per the Profile hierarchy invariant — identity/taste/listening stay strongest).
- [ ] Wire `setEdition`; persist to AsyncStorage; `system` live-follows OS appearance changes.
- [ ] Validation: toggle each option; kill/relaunch app → choice persists; flip OS dark mode under `system` → app follows.

### N5 — a11y / contrast / switch polish

- [ ] Contrast audit every text/background pair in night for WCAG AA body text; tune the night hexes above if any pair fails (the values are a starting point, not final).
- [ ] Switch transition: optional tasteful crossfade on edition change, **Reduce-Motion gated** (instant swap when Reduce Motion is on). No flashing during the swap.
- [ ] Reduce Motion, Dynamic Type, and screen-reader behavior unchanged by edition.
- [ ] Final: `make check`; full device sweep in Day, Night, and System (OS light + dark) with Reduce Motion on/off.

---

## Coordination with Skia (parent C2)

Do Night Edition **before** Skia motion (parent dependency graph). Skia renders (halftone cover shader, ink-press) must read the active palette via the hook too; authoring them once, palette-aware, avoids redoing them per edition. Flag to whoever picks up C2.

## AGENTS.md updates (same PRs)

- Replace the "Palette source of truth is `theme/colors.js` / `skinStyles.ts`" line with: palettes resolved at runtime via `EditorialThemeProvider` / `useEditorialPalette`; `dayPalette`/`nightPalette` are the token sets; `editorialColors` aliases `dayPalette`.
- Document the edition toggle, AsyncStorage `editorial-edition` persistence, `system` follow behavior.
- Document the **ShareCard-captures-Day-always** rule.
- Note the night hex set and that contrast was verified.

## Risks

- **Half-migrated state**: if N2/N3 stall, the app still works (unmigrated files use `editorialColors` = day), but mixed editions look broken when night is forced. Keep night non-default until N3 completes; ship the toggle (N4) only after every surface is migrated.
- **Expo Go vs dev client**: pure palette/AsyncStorage work needs no native change and runs in Expo Go. (Skia in C2 may not — that is the parent plan's concern.)
- **Performance**: palette is a plain object from context; re-renders on edition change only. No per-frame cost.

## Out of scope

- Per-screen or scheduled auto-night (sunset). `system` follow is enough.
- Night-specific cover art treatment beyond palette (that is Skia C2).
- Theming non-editorial/admin surfaces (there are none shipped; registry exposes only editorial).
