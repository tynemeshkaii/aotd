# Editorial UI Bug Fixes — 2026-06-15

Source: on-device review (iOS Simulator, Expo Go) by the user. Screenshots of Home,
Home rating area, Standing Order, Discoveries, and Profile.

This plan covers three user-reported bugs plus a shared root cause and a few minor
observations. Scope is presentation only — no controller/data/recommendation changes.

All line numbers below were captured on 2026-06-15 and may drift; re-grep before editing.

---

## Bug 1 — Crop marks overlap the album title (and should be removed)

**Report:** On Home, the corner "crop mark" elements around the cover overlap the album
title, and the user dislikes them in general — remove them.

**Root cause:**
- The cover plate renders `<EditorialCropMarks />` at the four corners of
  `EditorialIssueFrame` ([components/skins/editorial/index.tsx:307](components/skins/editorial/index.tsx:307)).
- The album title sits in a `zIndex.titleOverCover` wrapper, and the cover plate below it
  uses `marginTop: -14` to overlap the title onto the plate
  ([index.tsx:503-516](components/skins/editorial/index.tsx:503)).
- The top crop marks live at `top: 0` of the padded frame, exactly where the overlapping
  title's last line lands → visual collision.

**Fix (recommended — matches the user's "remove them" preference):**
- Remove `<EditorialCropMarks />` from `EditorialIssueFrame`
  ([index.tsx:298-316](components/skins/editorial/index.tsx:298)). This removes the marks
  everywhere the frame is used: the Home cover, the Home loading skeleton
  ([index.tsx:391](components/skins/editorial/index.tsx:391)), and the Discoveries archive
  row thumbnails ([index.tsx:961](components/skins/editorial/index.tsx:961)) — consistent
  with the user disliking the element overall.
- Remove the now-unused import at [index.tsx:25](components/skins/editorial/index.tsx:25).
- Delete `components/skins/editorial/EditorialCropMarks.tsx` (no other references — verified
  by grep), or leave the file orphaned if minimizing the diff is preferred. Prefer deleting.
- Keep the `marginTop: -14` title-over-plate overlap. With the marks gone, the title now
  overlaps only the paper margin / ink border of the plate, which is the intended
  "title overlapping the plate" editorial look. If it still reads tight on device, reduce
  the overlap from `-14` to about `-8` (optional, verify visually).

**Contract / doc updates (required — this changes a documented contract):**
- `AGENTS.md` documents crop marks as part of the cover-plate contract
  ("`EditorialCropMarks` at the corners … marks sit on paper, never over artwork"). Update
  that line to drop crop marks from the cover-plate description.
- `plans/2026-06-11-editorial-visual-polish.md` lists "cover plate/crop marks" as shipped —
  add a note that crop marks were removed on 2026-06-15.

---

## Bug 2 — Discoveries "All / Waiting / Rated" tab labels are too small

**Report:** The segmented filter labels on Discoveries render with a tiny font.

**Root cause:** `ArchiveFilterTab` sets `adjustsFontSizeToFit` with `numberOfLines={1}` on
the label inside a `flex-1` + `min-h-11` `Pressable`
([index.tsx:709-716](components/skins/editorial/index.tsx:709)). `adjustsFontSizeToFit`
inside a flex-sized container is a known RN pitfall: it shrinks text far below the base size
even when it would otherwise fit. Base size is only `type.monoLabel` = 11px
([skinStyles.ts:66](components/skins/shared/skinStyles.ts:66)), so the shrink makes it
unreadable.

**Fix:**
- Remove `adjustsFontSizeToFit` from the label `Text`
  ([index.tsx:713](components/skins/editorial/index.tsx:713)). Keep `numberOfLines={1}`.
- The three labels (ALL / WAITING / RATED) fit at 11px in a ~1/3-width tab; once the auto
  shrink is gone they render at full size. Optionally bump to a dedicated 12–13px mono token
  for tap clarity, but verify WAITING still fits at the narrowest device width first.
- Keep `min-h-11` (44px touch target) and the ink/paper pressed-inversion behavior.

---

## Bug 3 — Bottom tab items hug the top edge of the tab bar

**Report:** Home / Discoveries / Profile icons + labels sit too close to the top border of
the tab bar; spacing looks unbalanced.

**Root cause:**
- `TAB_BAR_TOP_PADDING = 0` ([lib/navigationChrome.ts:3](lib/navigationChrome.ts:3)), so the
  60px item row is flush against the 2–3px top rule.
- `EditorialTabIcon` top-aligns its content with `paddingTop: 9`, `paddingBottom: 4`
  ([app/(tabs)/_layout.tsx:34-42](app/(tabs)/_layout.tsx:34)).
- On notched iPhones the tab bar's bottom padding equals the safe-area inset (~34px), which
  is empty space below the item. Net result: ~9px above the icon vs ~34px below → top-heavy,
  icons jammed under the rule.

**Fix (rebalance vertical spacing; keep the printed-rule active indicator):**
- Give the item row breathing room from the top rule: set `TAB_BAR_TOP_PADDING` to ~6–8
  ([lib/navigationChrome.ts:3](lib/navigationChrome.ts:3)). `getTabBarHeight` and
  `getTabContentBottomPadding` both derive from this constant, so total bar height and tab
  screen content padding stay consistent automatically — no other call sites to touch.
- In `EditorialTabIcon` ([app/(tabs)/_layout.tsx:34](app/(tabs)/_layout.tsx:34)), center the
  icon + label cluster vertically within the item instead of top-aligning, and keep the
  active indicator as a short rule ~4–6px above the icon (not flush at `top: 0` against the
  border). Target: the icon cluster is visually centered in the bar's content band above the
  home indicator.
- Keep `getTabBarItemHeight()` as the single source for item height and
  `tabBarHideOnKeyboard` enabled (existing contracts).

Tune exact px on device — goal is balanced top/bottom spacing, not specific numbers.

---

## Shared root cause to watch: `adjustsFontSizeToFit` in flex containers

The bottom tab label also uses `adjustsFontSizeToFit` + `numberOfLines={1}`
([app/(tabs)/_layout.tsx:66-67](app/(tabs)/_layout.tsx:66)). "Discoveries" is the longest
label and may shrink slightly versus "home"/"profile". While fixing Bug 3, verify the three
labels render at a consistent size; if "Discoveries" shrinks, drop `adjustsFontSizeToFit`
there too and rely on `numberOfLines={1}` (truncation is unlikely at 12px in a 96px-min
item). Per `AGENTS.md`, `adjustsFontSizeToFit` is intended for single-line fixed-size
mastheads, not flex-sized chips/labels.

---

## Other observations (no action needed)

- Home "SAVE RATING" appears grey before a rating is selected — that is the documented
  disabled resting state (`EditorialActionButton` keeps the resting palette at reduced
  opacity), not a bug.
- Non-English album titles in the Discoveries list (e.g. Cyrillic) are album *data*, not UI
  copy. The English-only invariant applies to UI strings, so this is correct.
- Profile "COLOPHON" micro-kicker and the rainbow rule are intentional editorial treatment.

---

## Validation

- `npm run typecheck`
- `npm run lint`
- Re-run on iOS Simulator / device and confirm:
  - Home: no corner marks; title no longer collides; cover plate still framed.
  - Discoveries: ALL / WAITING / RATED legible and consistently sized.
  - Tab bar: icons + labels balanced vertically, not hugging the top rule, on a notched
    device.
- If `EditorialCropMarks.tsx` is deleted, confirm no dangling import remains (grep
  `CropMarks`).
- No Metro/font-config change here, so `npx expo start -c` is not required.

## Out of scope

Controllers, data fetching, recommendation/sync logic, and any non-editorial skin behavior.
