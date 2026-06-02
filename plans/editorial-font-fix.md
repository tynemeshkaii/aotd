# Editorial Font Fix — why the app doesn't match the locked preview

> **Status:** Diagnosed, fix in progress.
> **Symptom:** The shipped app looks nothing like the locked companion preview — "fonts differ a lot,
> accents wrong". The composition (§8.0/§8.1) is correct, but the **type is rendering in the system font**.

## Root cause (proven)

The editorial skin styles every text with NativeWind arbitrary classes like `font-[Archivo_800ExtraBold]`,
`font-[SpaceMono_400Regular]`, `font-[SpaceGrotesk_400Regular]`. Compiling the project's Tailwind/NativeWind
config against those classes produces:

```
.font-\[Archivo_800ExtraBold\] { font-weight: Archivo 800ExtraBold; }
.font-\[SpaceMono_400Regular\] { font-weight: SpaceMono 400Regular; }
```

Two compounding bugs:

1. **Wrong property.** Tailwind's `font-[…]` arbitrary utility is ambiguous (font-family vs font-weight). The
   heuristic resolved it to **`font-weight`**, not `font-family`. `font-weight: Archivo 800ExtraBold` is
   invalid and is dropped.
2. **Underscore → space.** Tailwind arbitrary values convert `_` to a space, so the family name would have
   been `Archivo 800ExtraBold` (space) anyway — which never matches the loaded font registered as
   `Archivo_800ExtraBold` (underscore).

Net effect: **no `fontFamily` is ever applied** anywhere in the editorial skin. The fonts load fine
(`useSkinFonts` gates render correctly), but the class never wires them up, so every label falls back to the
OS system font. That is the entire "looks wrong / different fonts / accents look off (masthead `day`)"
difference from the preview. The accent flow system itself is correct.

## Scope

60 occurrences, 6 tokens, 5 files (`components/skins/editorial/*`):

```
17  font-[Archivo_800ExtraBold]
15  font-[SpaceMono_400Regular]
13  font-[SpaceGrotesk_400Regular]
11  font-[SpaceMono_700Bold]
 2  font-[SpaceGrotesk_700Bold]
 2  font-[SpaceGrotesk_500Medium]
```

## Fix (deterministic, standard NativeWind pattern)

Stop using ambiguous `font-[…]` arbitrary values. Register named `fontFamily` utilities whose **values are the
exact loaded font names** (so no weight-ambiguity, no underscore mangling), then use the named classes.

1. `tailwind.config.js` → `theme.extend.fontFamily`:

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
},
```

2. Replace tokens across the 5 editorial files:

| Old | New |
|---|---|
| `font-[Archivo_800ExtraBold]` | `font-display` |
| `font-[Archivo_600SemiBold]` | `font-display-semibold` |
| `font-[SpaceMono_400Regular]` | `font-mono` |
| `font-[SpaceMono_700Bold]` | `font-mono-bold` |
| `font-[SpaceGrotesk_400Regular]` | `font-prose` |
| `font-[SpaceGrotesk_500Medium]` | `font-prose-medium` |
| `font-[SpaceGrotesk_700Bold]` | `font-prose-bold` |

The bundled weight (ExtraBold / Bold / Medium / Regular) lives in the font file itself, so no extra
`font-weight` class is needed.

## Verification

1. Re-run the Tailwind compile probe — confirm output now emits `font-family: Archivo_800ExtraBold` (underscore,
   correct property), not `font-weight`.
2. `npm run typecheck` + `npm run lint` clean.
3. On device (`npx expo start -c`): Home masthead/title render in Archivo, spec/kicker in Space Mono, "why" in
   Space Grotesk — matching the companion preview.

## After this

Fonts are the dominant gap. Once they match, compare the device to the preview again for any remaining
size/spacing/weight tuning (masthead scale, block gaps) and adjust in a small follow-up pass.
