# Editorial Visual Polish Implementation Plan

> **Superseded note (2026-06-15):** Task 7's corner crop marks (`EditorialCropMarks`) were
> removed — they collided with the overlapping album title and the user disliked them. The
> component file is deleted; the cover plate keeps its ink frame and title overlap. See
> `plans/2026-06-15-editorial-ui-bug-fixes.md`. Do not reintroduce crop marks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the editorial PRESS skin — tokenize spacing/tracking/rule weights, deepen the print metaphor (cover plate with crop marks, paper grain, initial cap, rated stamp, archive month headers, share-card barcode), replace opacity pressed-states with ink↔paper inversion, and fix small semantic/legibility issues.

**Architecture:** All changes are presentation-only inside the editorial skin (`components/skins/editorial/*`, `components/skins/shared/skinStyles.ts`). No controller, route, copy, data, or Supabase changes. Product invariants from `AGENTS.md` (flowing-accent scarcity, no negative letterSpacing, Reduce Motion respect, view-shot `Image` in ShareCard, square corners) are preserved.

**Tech Stack:** Expo SDK 54 / RN 0.81.5, NativeWind v4, Reanimated, react-native-view-shot (share card untouched mechanically).

**Validation per task:** no app unit-test infra for visual components (per `AGENTS.md` validation rules) — each task validates with `rtk tsc` + `rtk lint`, plus visual check via `app/skin-fixtures.tsx` / device at the end.

**Out of scope (explicitly):** custom tab-bar icon set, dark "night edition", rating-row pressed inversion (rows already invert on selection), any copy changes.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `components/skins/shared/skinStyles.ts` | Modify | add `space`, `tracking`, `ruleWeight` tokens |
| `components/skins/editorial/EditorialSectionRule.tsx` | Modify | `weight` prop (hairline/rule/heavy) |
| `components/skins/editorial/EditorialActionButton.tsx` | Create | extracted button + pressed inversion |
| `components/skins/editorial/EditorialAlbumActions.tsx` | Modify | CTA stripe color, CTA pressed inversion, prominent Share button |
| `components/skins/editorial/EditorialCropMarks.tsx` | Create | print crop marks overlay |
| `components/skins/editorial/PaperGrain.tsx` | Create | tiled noise overlay |
| `components/skins/editorial/index.tsx` | Modify | spacing/tracking sweep, WhyRule removal, cover plate, initial cap, stamp, month grouping, profile ledger, share-card footer, grain mounting, filter-tab/archive-link inversion |
| `scripts/generate-paper-grain.mjs` | Create | one-off dependency-free PNG generator |
| `assets/textures/paper-grain.png` | Create (generated) | 144×144 tileable grayscale noise |

---

### Task 1: Design tokens — spacing, tracking, rule weights

**Files:**
- Modify: `components/skins/shared/skinStyles.ts`

- [ ] **Step 1: Add tokens**

Append to `components/skins/shared/skinStyles.ts` (after `editorialColors`):

```ts
// 4pt spacing scale. Use these for editorial margins/gaps instead of ad-hoc
// pixel values so vertical rhythm stays on-grid.
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
} as const;

// Letter-tracking scale. kicker = wide mono kickers, label = bordered mono
// labels/buttons, micro = tiny mono metadata.
export const tracking = {
  label: 0.8,
  micro: 1.0,
  kicker: 1.4,
} as const;

// Printed rule weights.
export const ruleWeight = {
  hairline: 1,
  rule: 2,
  heavy: 3,
} as const;
```

- [ ] **Step 2: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean (tokens unused yet — Biome does not flag unused exports).

- [ ] **Step 3: Commit**

```bash
rtk git add components/skins/shared/skinStyles.ts
rtk git commit -m "feat(skin): add spacing/tracking/rule-weight tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `EditorialSectionRule` weight prop + retire `EditorialWhyRule`

**Files:**
- Modify: `components/skins/editorial/EditorialSectionRule.tsx`
- Modify: `components/skins/editorial/index.tsx` (remove `EditorialWhyRule`, lines ~204–213; replace usage ~line 442)

- [ ] **Step 1: Add `weight` prop to SectionRule**

Replace `EditorialSectionRule.tsx` body:

```tsx
import { View, type ViewProps } from 'react-native';

import { editorialColors, ruleWeight, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';

type Props = ViewProps & {
  title?: string;
  aside?: string;
  major?: boolean;
  weight?: keyof typeof ruleWeight;
};

export function EditorialSectionRule({ title, aside, major = false, weight, style, ...rest }: Props) {
  const height = ruleWeight[weight ?? (major ? 'rule' : 'hairline')];
  return (
    <View {...rest} className="flex-row items-center gap-3" style={[{ minHeight: 24 }, style]}>
      {title ? (
        <Text
          className="font-mono-bold text-[11px] uppercase leading-4"
          style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
        >
          {title}
        </Text>
      ) : null}
      <View className="flex-1" style={{ height, backgroundColor: editorialColors.rule }} />
      {aside ? (
        <Text
          className="font-mono text-[11px] uppercase leading-4"
          style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
        >
          {aside}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Replace `EditorialWhyRule` in index.tsx**

Delete the `EditorialWhyRule` function. In `EditorialAlbumDetailView`, replace:

```tsx
<EditorialWhyRule />
```

with:

```tsx
<EditorialSectionRule title="Why this one?" weight="heavy" />
```

- [ ] **Step 3: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean; grep confirms no `EditorialWhyRule` references remain: `rtk grep "EditorialWhyRule" components`

- [ ] **Step 4: Commit**

```bash
rtk git add components/skins/editorial/EditorialSectionRule.tsx components/skins/editorial/index.tsx
rtk git commit -m "refactor(skin): rule-weight prop on SectionRule, retire WhyRule

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Spacing + tracking sweep, 9px legibility bump

**Files:**
- Modify: `components/skins/editorial/index.tsx`

- [ ] **Step 1: Import tokens**

```ts
import { editorialColors, ratingTone, space, tracking } from '@/components/skins/shared/skinStyles';
```

- [ ] **Step 2: Normalize the `type` object tracking**

In the `type` const:
- `monoKicker.letterSpacing: 1.43` → `tracking.kicker`
- `monoLabel.letterSpacing: 1.32` → `tracking.kicker`
- `archiveIssue.letterSpacing: 1.1` → `tracking.micro`
- `archiveMeta.letterSpacing: 0.95` → `tracking.micro`

- [ ] **Step 3: Replace ad-hoc spacing in `EditorialAlbumDetailView`**

| Current | New |
|---|---|
| `style={{ marginTop: 22 }}` (title/cover block) | `style={{ marginTop: space.s6 }}` |
| `style={{ marginTop: 14 }}` (spec line) | `style={{ marginTop: space.s4 }}` |
| `style={{ marginTop: 18 }}` (why block) | `style={{ marginTop: space.s5 }}` |
| `style={{ marginTop: 22 }}` (actions block) | `style={{ marginTop: space.s6 }}` |
| `style={{ marginTop: props.isFreeSpotify ? 20 : 26 }}` | `style={{ marginTop: props.isFreeSpotify ? space.s5 : space.s6 }}` |
| `<View style={{ marginTop: 22 }}>{props.footer}</View>` | `<View style={{ marginTop: space.s6 }}>{props.footer}</View>` |
| `className="mt-[7px] lowercase"` (masthead) | `className="mt-2 lowercase"` |

- [ ] **Step 4: Replace ad-hoc spacing in `EditorialDiscoveryRow`**

- `className="mt-[5px] uppercase"` → `className="mt-1 uppercase"`
- `className="mt-[9px] self-start"` → `className="mt-2 self-start"`

- [ ] **Step 5: Normalize inline letterSpacing values in index.tsx**

- Rating-editor microcopy `letterSpacing: 0.9` → `tracking.label`
- All remaining inline `letterSpacing: 0.8` → `tracking.label`
- "Powered by Spotify": `className="mt-2 font-mono text-[9px] uppercase leading-3"` + `letterSpacing: 0.7` → `className="mt-2 font-mono text-[10px] uppercase leading-4"` + `letterSpacing: tracking.micro`
- Share card `letterSpacing: 1.2` (both places) → `tracking.kicker`

- [ ] **Step 6: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean. Spot check: `rtk grep "letterSpacing: 0\\.[79]" components/skins` → no matches; `rtk grep "text-\\[9px\\]" components` → no matches.

- [ ] **Step 7: Commit**

```bash
rtk git add components/skins/editorial/index.tsx
rtk git commit -m "style(skin): tokenize spacing/tracking, bump 9px micro text to 10px

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Extract `EditorialActionButton` with pressed ink↔paper inversion

**Files:**
- Create: `components/skins/editorial/EditorialActionButton.tsx`
- Modify: `components/skins/editorial/index.tsx` (delete local definition ~lines 151–202, add import)

- [ ] **Step 1: Create the extracted component**

`components/skins/editorial/EditorialActionButton.tsx`:

```tsx
import * as React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { editorialColors, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';

type Tone = 'ink' | 'paper' | 'red';

// Pressed state inverts ink<->paper like a print impression instead of fading
// opacity. Disabled keeps the resting palette at reduced opacity.
function palette(tone: Tone, pressed: boolean) {
  const borderColor = tone === 'red' ? editorialColors.red : editorialColors.ink;
  if (tone === 'ink') {
    return pressed
      ? { borderColor, backgroundColor: 'transparent', foreground: editorialColors.ink }
      : { borderColor, backgroundColor: editorialColors.ink, foreground: editorialColors.paper };
  }
  if (tone === 'red') {
    return pressed
      ? { borderColor, backgroundColor: editorialColors.red, foreground: editorialColors.paper }
      : { borderColor, backgroundColor: 'transparent', foreground: editorialColors.red };
  }
  return pressed
    ? { borderColor, backgroundColor: editorialColors.ink, foreground: editorialColors.paper }
    : { borderColor, backgroundColor: 'transparent', foreground: editorialColors.ink };
}

export function EditorialActionButton({
  title,
  onPress,
  loading,
  disabled,
  tone = 'ink',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: Tone;
}) {
  const [pressed, setPressed] = React.useState(false);
  const isDisabled = disabled || loading;
  const p = palette(tone, pressed && !isDisabled);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptics.impactLight();
        onPress();
      }}
      className={`min-h-12 flex-row items-center justify-center gap-2 border-2 px-4 py-3 ${
        isDisabled ? 'opacity-60' : ''
      }`}
      style={{ borderColor: p.borderColor, backgroundColor: p.backgroundColor }}
    >
      {loading ? <ActivityIndicator color={p.foreground} size="small" /> : null}
      <Text
        className="font-mono-bold text-xs uppercase leading-4"
        style={{ color: p.foreground, letterSpacing: tracking.label }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 2: Swap index.tsx to the import**

Delete the local `EditorialActionButton` function from `index.tsx`; add:

```ts
import { EditorialActionButton } from '@/components/skins/editorial/EditorialActionButton';
```

All existing call sites (rating editor, profile sync, log out, archive link sibling, error/empty states, initial syncing) keep working unchanged.

- [ ] **Step 3: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
rtk git add components/skins/editorial/EditorialActionButton.tsx components/skins/editorial/index.tsx
rtk git commit -m "refactor(skin): extract action button, pressed state inverts ink/paper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Pressed inversion for filter tabs + archive link

**Files:**
- Modify: `components/skins/editorial/index.tsx`

- [ ] **Step 1: Componentize filter tab with pressed state**

Add above `EditorialDiscoveriesView`:

```tsx
function ArchiveFilterTab({
  label,
  selected,
  isFirst,
  onPress,
}: {
  label: string;
  selected: boolean;
  isFirst: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = React.useState(false);
  const inverted = selected || pressed;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      className="min-h-11 flex-1 items-center justify-center px-2"
      style={{
        backgroundColor: inverted ? editorialColors.ink : 'transparent',
        borderLeftWidth: isFirst ? 0 : 1,
        borderLeftColor: editorialColors.ink,
      }}
    >
      <Text
        className="uppercase"
        style={[type.monoLabel, { color: inverted ? editorialColors.paper : editorialColors.ink }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  );
}
```

In `EditorialDiscoveriesView`, replace the inline tab `Pressable` map body with:

```tsx
{(Object.keys(filterLabels) as DiscoveryFilter[]).map((filter, index) => (
  <ArchiveFilterTab
    key={filter}
    label={filterLabels[filter]}
    selected={props.filter === filter}
    isFirst={index === 0}
    onPress={() => props.onFilterChange(filter)}
  />
))}
```

- [ ] **Step 2: Invert `EditorialArchiveLink` on press**

Replace its body:

```tsx
function EditorialArchiveLink({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = React.useState(false);
  const foreground = pressed ? editorialColors.paper : editorialColors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptics.impactLight();
        onPress();
      }}
      className="min-h-12 flex-row items-center justify-between border-2 px-3 py-3"
      style={{
        borderColor: editorialColors.ink,
        backgroundColor: pressed ? editorialColors.ink : 'transparent',
      }}
    >
      <Text
        className="font-mono-bold text-xs uppercase leading-4"
        style={{ color: foreground, letterSpacing: tracking.label }}
      >
        Open rated archive
      </Text>
      <Ionicons name="arrow-forward" size={18} color={foreground} />
    </Pressable>
  );
}
```

- [ ] **Step 3: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
rtk git add components/skins/editorial/index.tsx
rtk git commit -m "style(skin): filter tabs and archive link invert ink/paper on press

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: CTA stripe semantics + prominent Share button + CTA pressed inversion

**Files:**
- Modify: `components/skins/editorial/EditorialAlbumActions.tsx`

- [ ] **Step 1: Rewrite `EditorialAlbumActions`**

Full replacement:

```tsx
import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { EditorialActionButton } from '@/components/skins/editorial/EditorialActionButton';
import { editorialColors, space } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';

type Props = {
  opening: boolean;
  sharing: boolean;
  onOpen: () => void;
  onShare: () => void;
};

export function EditorialAlbumActions({ opening, sharing, onOpen, onShare }: Props) {
  const [pressed, setPressed] = React.useState(false);
  const inverted = pressed && !opening;
  const surface = inverted ? 'transparent' : editorialColors.ink;
  const onSurface = inverted ? editorialColors.ink : editorialColors.paper;

  return (
    <View style={{ gap: space.s3 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open in Spotify"
        accessibilityState={{ busy: opening }}
        disabled={opening}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          haptics.impactLight();
          onOpen();
        }}
        className="border-2 p-3"
        style={{ borderColor: editorialColors.ink, backgroundColor: surface }}
      >
        <View
          className="absolute left-0 right-0 top-0 h-[3px]"
          style={{ backgroundColor: editorialColors.accentStatic }}
        />
        <View className="flex-row items-stretch gap-3 pt-[3px]">
          <View
            className="min-h-[62px] w-[62px] items-center justify-center border-2"
            style={{
              borderColor: inverted ? editorialColors.ink : editorialColors.paper,
              backgroundColor: inverted ? editorialColors.ink : editorialColors.paper,
            }}
          >
            {opening ? (
              <ActivityIndicator color={inverted ? editorialColors.paper : editorialColors.ink} />
            ) : (
              <View
                style={{
                  width: 0,
                  height: 0,
                  marginLeft: 5,
                  borderTopWidth: 14,
                  borderBottomWidth: 14,
                  borderLeftWidth: 22,
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                  borderLeftColor: inverted ? editorialColors.paper : editorialColors.ink,
                }}
              />
            )}
          </View>
          <Text
            className="flex-1 self-center font-display text-[30px] uppercase leading-[29px]"
            style={{ color: onSurface, letterSpacing: 0 }}
          >
            Open in{'\n'}Spotify
          </Text>
        </View>
      </Pressable>

      <EditorialActionButton
        title={sharing ? 'Sharing...' : 'Share this issue'}
        tone="paper"
        loading={sharing}
        onPress={onShare}
      />
    </View>
  );
}
```

Notes: the gold `#d9a441` stripe (rate-loved semantic) becomes `accentStatic` — accent on CTA is allowed by the skin contract. The quiet "Share ↗" text link becomes a full-width paper-tone bordered button.

- [ ] **Step 2: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
rtk git add components/skins/editorial/EditorialAlbumActions.tsx
rtk git commit -m "style(skin): accent CTA stripe, prominent share button, CTA press inversion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Cover plate — ink frame, crop marks, bolder title overlap

**Files:**
- Create: `components/skins/editorial/EditorialCropMarks.tsx`
- Modify: `components/skins/editorial/index.tsx` (`EditorialAlbumDetailView` cover block, ~lines 408–435)

- [ ] **Step 1: Create crop marks overlay**

`components/skins/editorial/EditorialCropMarks.tsx`:

```tsx
import { View } from 'react-native';

import { editorialColors } from '@/components/skins/shared/skinStyles';

// Print registration crop marks at the four corners of the parent. Parent must
// be position-relative; marks render in the paper margin around the cover plate.
export function EditorialCropMarks({
  length = 14,
  thickness = 2,
}: {
  length?: number;
  thickness?: number;
}) {
  const bar = { position: 'absolute' as const, backgroundColor: editorialColors.ink };
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <View style={[bar, { left: 0, top: 0, width: length, height: thickness }]} />
      <View style={[bar, { left: 0, top: 0, width: thickness, height: length }]} />
      <View style={[bar, { right: 0, top: 0, width: length, height: thickness }]} />
      <View style={[bar, { right: 0, top: 0, width: thickness, height: length }]} />
      <View style={[bar, { left: 0, bottom: 0, width: length, height: thickness }]} />
      <View style={[bar, { left: 0, bottom: 0, width: thickness, height: length }]} />
      <View style={[bar, { right: 0, bottom: 0, width: length, height: thickness }]} />
      <View style={[bar, { right: 0, bottom: 0, width: thickness, height: length }]} />
    </View>
  );
}
```

- [ ] **Step 2: Wrap the cover in a plate**

In `EditorialAlbumDetailView`, replace the current cover container:

```tsx
<View
  className="aspect-square w-full overflow-hidden"
  style={{ backgroundColor: editorialColors.paperAlt, marginTop: -8, zIndex: 1 }}
>
  ...
</View>
```

with:

```tsx
<View style={{ marginTop: -14, zIndex: 1, padding: space.s3 }}>
  <EditorialCropMarks />
  <View
    className="aspect-square w-full overflow-hidden border-2"
    style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.paperAlt }}
  >
    <Animated.View style={[{ flex: 1 }, coverStyle]}>
      {props.album.album_cover_url ? (
        <CoverImage uri={props.album.album_cover_url} className="h-full w-full" />
      ) : (
        <View className="h-full w-full items-center justify-center px-8">
          <BrandMark size={84} muted />
          <Text
            className="mt-5 text-center font-display text-3xl uppercase"
            style={{ color: editorialColors.muted }}
          >
            Cover unavailable
          </Text>
        </View>
      )}
    </Animated.View>
    {markers.length > 0 ? (
      <View className="absolute bottom-2 right-2 flex-row gap-2">
        {markers.map((marker) => (
          <EditorialMarker key={marker} label={marker} />
        ))}
      </View>
    ) : null}
  </View>
</View>
```

Add the import:

```ts
import { EditorialCropMarks } from '@/components/skins/editorial/EditorialCropMarks';
```

Notes: title `zIndex: 2` already wins over the plate; overlap deepens from -8 to -14 so the headline sits on the plate margin. Crop marks live on paper (the `space.s3` padding ring), never over artwork — visible regardless of cover darkness. Cover shrinks by 24px+4px border; it remains the dominant surface.

- [ ] **Step 3: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
rtk git add components/skins/editorial/EditorialCropMarks.tsx components/skins/editorial/index.tsx
rtk git commit -m "feat(skin): cover plate with ink frame, crop marks, deeper title overlap

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Paper grain texture

**Files:**
- Create: `scripts/generate-paper-grain.mjs`
- Create: `assets/textures/paper-grain.png` (generated)
- Create: `components/skins/editorial/PaperGrain.tsx`
- Modify: `components/skins/editorial/index.tsx` (mount on root surfaces + share card)

- [ ] **Step 1: Write the dependency-free PNG generator**

`scripts/generate-paper-grain.mjs`:

```js
// One-off generator for assets/textures/paper-grain.png — a 144x144 8-bit
// grayscale tileable noise PNG. Dependency-free (node:zlib + manual chunks).
// Re-run: node scripts/generate-paper-grain.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 144;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260611);
const rows = [];
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE);
  row[0] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    row[1 + x] = 128 + Math.round((rand() - 0.5) * 56);
  }
  rows.push(row);
}
const raw = Buffer.concat(rows);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // color type: grayscale

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('assets/textures', { recursive: true });
writeFileSync('assets/textures/paper-grain.png', png);
console.log(`wrote assets/textures/paper-grain.png (${png.length} bytes)`);
```

- [ ] **Step 2: Generate the asset**

Run: `node scripts/generate-paper-grain.mjs`
Expected: `wrote assets/textures/paper-grain.png (~15-25 KB)`. Open the file to eyeball: flat gray noise, no banding.

- [ ] **Step 3: Create the overlay component**

`components/skins/editorial/PaperGrain.tsx`:

```tsx
import { Image, View } from 'react-native';

// Static paper-grain overlay. Uses core RN Image because resizeMode="repeat"
// tiles natively on both platforms. No animation — Reduce Motion irrelevant.
const grain = require('@/assets/textures/paper-grain.png');

export function PaperGrain({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" className="absolute inset-0" style={{ zIndex: 20 }}>
      <Image
        source={grain}
        resizeMode="repeat"
        style={{ width: '100%', height: '100%', opacity }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </View>
  );
}
```

If Metro rejects the aliased `require`, fall back to `require('../../../assets/textures/paper-grain.png')`.

- [ ] **Step 4: Mount on root surfaces**

In `index.tsx`, add import:

```ts
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
```

- `EditorialAlbumDetailView`: add `<PaperGrain />` as the last child of the root `<View className="flex-1" ...>` (after `Animated.ScrollView`).
- `EditorialDiscoveriesView`: add `<PaperGrain />` as the last child of the root `<View className="flex-1" ...>`.
- `EditorialProfileView`: wrap the `ScrollView` in `<View className="flex-1" style={{ backgroundColor: editorialColors.paper }}>`, move `style.backgroundColor` off the ScrollView, add `<PaperGrain />` after the ScrollView inside the wrapper.
- `EditorialSignInView`: add `<PaperGrain />` as the last child of the root `View`.
- `EditorialInitialSyncingView`: add `<PaperGrain />` as the last child of the root `View`.
- `EditorialShareCard`: add `<PaperGrain opacity={0.06} />` as the last child of the root `View` (grain bakes into the shared PNG).

- [ ] **Step 5: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean. If TS complains about the png `require`, confirm `expo-env.d.ts` asset declarations are included by tsconfig.

- [ ] **Step 6: Commit**

```bash
rtk git add scripts/generate-paper-grain.mjs assets/textures/paper-grain.png components/skins/editorial/PaperGrain.tsx components/skins/editorial/index.tsx
rtk git commit -m "feat(skin): subtle paper-grain overlay on editorial surfaces

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Initial cap in "Why this one?"

**Files:**
- Modify: `components/skins/editorial/index.tsx`

- [ ] **Step 1: Add `ReasonParagraph`**

Above `EditorialAlbumDetailView`:

```tsx
// Magazine-style raised initial: first letter set in display face inline.
// True wrapped drop caps are not reliable in RN, so the cap is raised, not dropped.
function ReasonParagraph({ text }: { text: string }) {
  const trimmed = text.trim();
  const first = trimmed.charAt(0);
  const rest = trimmed.slice(1);
  if (!/[A-Za-z]/.test(first)) {
    return <Text style={[type.proseReason, { color: editorialColors.ink }]}>{trimmed}</Text>;
  }
  return (
    <Text style={[type.proseReason, { color: editorialColors.ink }]}>
      <Text
        style={{
          fontFamily: 'Archivo_800ExtraBold',
          fontSize: 27,
          lineHeight: 27,
          color: editorialColors.ink,
        }}
      >
        {first.toUpperCase()}
      </Text>
      {rest}
    </Text>
  );
}
```

- [ ] **Step 2: Use it**

In `EditorialAlbumDetailView`, replace:

```tsx
<Text className="mt-3" style={[type.proseReason, { color: editorialColors.ink }]}>
  {formatSelectionReason(props.album.selection_reason)}
</Text>
```

with:

```tsx
<View className="mt-3">
  <ReasonParagraph text={formatSelectionReason(props.album.selection_reason)} />
</View>
```

- [ ] **Step 3: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean. Device note for final check: nested-Text line height on iOS can stretch the first line slightly; if it looks loose, drop cap `fontSize/lineHeight` to 24.

- [ ] **Step 4: Commit**

```bash
rtk git add components/skins/editorial/index.tsx
rtk git commit -m "feat(skin): raised initial cap on selection reason

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Rated stamp on the ballot

**Files:**
- Modify: `components/skins/editorial/index.tsx` (`EditorialRatingEditor`)

- [ ] **Step 1: Add stamp component**

```tsx
// Rubber-stamp marker: stamp red, slight rotation. Decorative — the ballot
// itself carries the selected state for accessibility.
function EditorialStamp({ label }: { label: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="self-start border-2 px-2 py-1"
      style={{ borderColor: editorialColors.red, transform: [{ rotate: '-3deg' }] }}
    >
      <Text
        className="font-mono-bold text-[11px] uppercase leading-4"
        style={{ color: editorialColors.red, letterSpacing: tracking.kicker }}
      >
        {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Render it in `EditorialRatingEditor`**

After `<EditorialSectionRule title="Editorial ballot" major />`, before the microcopy kicker:

```tsx
{album.rating_score ? <EditorialStamp label={`Rated 0${album.rating_score}`} /> : null}
```

(`album.rating_score` is the persisted rating — the stamp appears only once a rating is saved, not on local selection.)

- [ ] **Step 3: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
rtk git add components/skins/editorial/index.tsx
rtk git commit -m "feat(skin): rated rubber stamp on editorial ballot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Archive month grouping

**Files:**
- Modify: `components/skins/editorial/index.tsx` (`EditorialDiscoveriesView`, `EditorialDiscoveryRow`)

- [ ] **Step 1: Add grouped list model**

```tsx
type ArchiveListItem =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; album: AlbumDiscovery; firstInGroup: boolean; isLast: boolean };

function monthLabel(pickDate: string) {
  return new Date(`${pickDate}T12:00:00`)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();
}

function buildArchiveItems(albums: AlbumDiscovery[]): ArchiveListItem[] {
  const items: ArchiveListItem[] = [];
  let currentMonth: string | null = null;
  albums.forEach((album, index) => {
    const label = monthLabel(album.pick_date);
    const firstInGroup = label !== currentMonth;
    if (firstInGroup) {
      currentMonth = label;
      items.push({ kind: 'header', key: `month-${label}`, label });
    }
    items.push({
      kind: 'row',
      key: album.aotd_id,
      album,
      firstInGroup,
      isLast: index === albums.length - 1,
    });
  });
  return items;
}

function EditorialArchiveMonthHeader({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 pb-2 pt-5">
      <Text
        className="font-mono-bold text-[11px] uppercase leading-4"
        style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
      >
        {label}
      </Text>
      <View className="h-[2px] flex-1" style={{ backgroundColor: editorialColors.ink }} />
    </View>
  );
}
```

- [ ] **Step 2: Rework row border props**

In `EditorialDiscoveryRow`, replace `isFirst: boolean` with `firstInGroup: boolean` and the border style with:

```tsx
style={{
  borderColor: editorialColors.ink,
  borderTopWidth: firstInGroup ? 0 : 1,
  borderBottomWidth: isLast ? 2 : 0,
}}
```

(the month header's 2px rule replaces the old leading 2px row border).

- [ ] **Step 3: Feed FlatList grouped data**

In `EditorialDiscoveriesView`:

```tsx
const items = React.useMemo(() => buildArchiveItems(props.filtered), [props.filtered]);
```

Update the FlatList:

```tsx
data={items}
keyExtractor={(item) => item.key}
renderItem={({ item, index }) =>
  item.kind === 'header' ? (
    <EditorialArchiveMonthHeader label={item.label} />
  ) : (
    <EditorialDiscoveryRow
      album={item.album}
      index={index}
      firstInGroup={item.firstInGroup}
      isLast={item.isLast}
      onPress={() => props.onOpenDiscovery(item.album)}
    />
  )
}
```

Also adjust list margin: with the header's own `pt-5`, change `className="mt-5 flex-1"` on the FlatList to `className="mt-1 flex-1"`. Keep `ListEmptyComponent`, refresh control, and perf props unchanged (`items` for an empty list is `[]`, so empty state still shows).

- [ ] **Step 4: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean. Confirm `ListSkeleton` untouched (loading state shows before grouping exists).

- [ ] **Step 5: Commit**

```bash
rtk git add components/skins/editorial/index.tsx
rtk git commit -m "feat(skin): group archive list by month with ruled headers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Profile taste map — ledger rows instead of stacked boxes

**Files:**
- Modify: `components/skins/editorial/index.tsx` (`EditorialProfileView`, artists block ~lines 1010–1050)

- [ ] **Step 1: Replace the six bordered boxes**

Replace:

```tsx
{artists.length > 0 ? (
  <View className="gap-3">
    {artists.slice(0, 6).map((artist, index) => (
      <View key={artist.name} className="border-2 px-3 py-3" style={{ borderColor: editorialColors.ink }}>
        ...
      </View>
    ))}
  </View>
) : null}
```

with a ruled ledger:

```tsx
{artists.length > 0 ? (
  <View className="border-y-2" style={{ borderColor: editorialColors.ink }}>
    {artists.slice(0, 6).map((artist, index) => (
      <View
        key={artist.name}
        className="flex-row items-start gap-3 py-3"
        style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopColor: editorialColors.ink }}
      >
        <Text
          className="w-9 font-mono-bold text-[11px] uppercase leading-5"
          style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
        >
          {String(index + 1).padStart(2, '0')}
        </Text>
        <Text
          className="min-w-0 flex-1 font-prose-bold text-lg leading-6"
          style={{ color: editorialColors.ink }}
          numberOfLines={2}
        >
          {artist.name}
        </Text>
        <View className="min-w-[54px] items-end">
          <Text
            className="font-mono-bold text-[11px] uppercase leading-5"
            style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
          >
            {artist.count}
          </Text>
          <Text
            className="font-mono text-[10px] uppercase leading-4"
            style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
          >
            saves
          </Text>
        </View>
      </View>
    ))}
  </View>
) : null}
```

Layout, rank/name/count internals, and wrap behavior (two-line artist names, stable count column) are unchanged — only the container chrome changes, preserving the Taste-map contracts in `AGENTS.md`.

- [ ] **Step 2: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean. Check Profile fixtures still cover this section: `rtk grep "Taste map\|top_artists" app/skin-fixtures.tsx` — fixtures pass scenario data through `ProfileView`, so no fixture code change expected; visual check happens in final task.

- [ ] **Step 3: Commit**

```bash
rtk git add components/skins/editorial/index.tsx
rtk git commit -m "style(skin): taste map artists as ruled ledger rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Share card — barcode + colophon footer

**Files:**
- Modify: `components/skins/editorial/index.tsx` (`EditorialShareCard`)

- [ ] **Step 1: Add deterministic pseudo-barcode**

```tsx
// Deterministic pseudo-barcode seeded by album id — print artifact for the
// share card footer. Pure decoration, never scanned.
function barcodeWidths(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const widths: number[] = [];
  for (let i = 0; i < 24; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    widths.push(2 + (h % 3) * 2);
  }
  return widths;
}

function EditorialBarcode({ seed }: { seed: string }) {
  return (
    <View className="flex-row items-end" style={{ height: 56, gap: 3 }}>
      {barcodeWidths(seed).map((width, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars, order never changes
          key={index}
          style={{
            width,
            height: index % 5 === 0 ? 56 : 44,
            backgroundColor: editorialColors.ink,
          }}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Replace the share card footer**

In `EditorialShareCard`, replace the trailing URL `Text`:

```tsx
<Text numberOfLines={1} className="font-mono text-2xl" style={{ color: editorialColors.muted }}>
  {spotifyAlbumUrl(album.album_spotify_id)}
</Text>
```

with:

```tsx
<View className="flex-row items-end justify-between gap-8">
  <EditorialBarcode seed={album.album_spotify_id} />
  <View className="min-w-0 flex-1 items-end">
    <Text
      className="font-mono-bold text-2xl uppercase"
      style={{ color: editorialColors.ink, letterSpacing: tracking.kicker }}
    >
      {`AOTD · No. ${issueNo(album)}`}
    </Text>
    <Text
      numberOfLines={1}
      className="mt-2 font-mono text-xl"
      style={{ color: editorialColors.muted }}
    >
      {spotifyAlbumUrl(album.album_spotify_id)}
    </Text>
  </View>
</View>
```

- [ ] **Step 3: Validate**

Run: `rtk tsc && rtk lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
rtk git add components/skins/editorial/index.tsx
rtk git commit -m "feat(skin): barcode and colophon footer on share card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Final validation pass

**Files:** none new.

- [ ] **Step 1: Full static validation**

Run: `make check` (lint + typecheck — broad app impact justifies full run per `AGENTS.md`).
Expected: clean.

- [ ] **Step 2: Fixture / device visual checklist**

Start dev server (`npm run start`), open `app/skin-fixtures.tsx` scenarios and live screens. Verify:

1. AlbumDetail: plate frame + crop marks visible on light and dark covers; title overlap reads as intentional; markers chips don't collide with crop marks; parallax overscroll still clips inside the frame.
2. Initial cap: first reason line not visibly stretched (iOS nested-Text lineHeight); if loose, reduce cap to 24/24.
3. Grain: visible at arm's length but not noisy over prose; check Home, Archive, Colophon, sign-in, first-sync, share PNG.
4. Pressed inversion: action buttons, filter tabs, archive link, big CTA — press-and-hold shows ink↔paper flip; disabled buttons don't flip.
5. Archive: month headers correct across month boundaries; first row of each group has no doubled rule; empty state and skeleton unchanged; entrance animation still staggers.
6. Profile: ledger rows aligned at large Dynamic Type; long artist names wrap to 2 lines without breaking the count column; all four fixture scenarios (rich/empty/syncing/failed) render.
7. Rated stamp appears only on persisted ratings, rotation doesn't clip.
8. Share card: capture a share PNG with slow/missing cover; barcode + colophon row fits 900px width with long URLs.
9. Dynamic Type sweep at ~1.4 multiplier: ballot, spec line, "Powered by Spotify" (now 10px) readable.
10. Long lowercase album titles: confirm `display34` (lineHeight 32 < fontSize 34) doesn't clip descenders on Android; if it does, bump `display34.lineHeight` to 34 in the `type` object (separate commit).

- [ ] **Step 3: Commit any device-tuning adjustments**

```bash
rtk git add -A
rtk git commit -m "style(skin): device-pass tuning for editorial polish

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- Spec coverage: spacing tokens (T1/T3), tracking (T1/T3), rule weights (T1/T2), 9px bump (T3), pressed inversion (T4/T5/T6), CTA stripe fix (T6), share prominence (T6), cover frame + crop marks + overlap (T7), grain (T8), initial cap (T9), stamp (T10), month grouping (T11), profile ledger (T12), share barcode/colophon (T13). Tab icons + night edition explicitly out of scope.
- Type consistency: `space`/`tracking`/`ruleWeight` defined in T1, consumed from T2 onward; `EditorialActionButton` extraction (T4) precedes its reuse in `EditorialAlbumActions` (T6); `firstInGroup` rename is self-contained in T11.
- Known risks called out inline: NativeWind + aliased `require` (T8 fallback), nested-Text initial cap metrics (T9/T14), month-header double-rule (T11/T14).
