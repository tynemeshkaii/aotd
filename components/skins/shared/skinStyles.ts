import type { RatingScore } from '@/lib/recommendation';

export type Palette = {
  // True for evening editions; drives chrome (e.g. status-bar style) without
  // brittle hex comparisons against a specific paper value.
  isDark: boolean;
  paper: string;
  paperAlt: string;
  ink: string;
  muted: string;
  rule: string;
  accentStatic: string;
  accent: string;
  primary: string;
  onPrimary: string;
  red: string;
  ratingTone: Record<RatingScore, string>;
};

export const dayPalette: Palette = {
  isDark: false,
  paper: '#f4ebe0',
  paperAlt: '#eadcc9',
  ink: '#1d1511',
  muted: '#6f5d52',
  rule: '#1d1511',
  accentStatic: '#ff4a2e',
  accent: '#ff4a2e',
  primary: '#87263b',
  onPrimary: '#fff6e8',
  red: '#9f2637',
  ratingTone: {
    5: '#d9a441',
    4: '#c98a3c',
    3: '#9c8b86',
    2: '#a8636b',
    1: '#8e3b46',
  },
};

export const nightPalette: Palette = {
  isDark: true,
  paper: '#17120f',
  paperAlt: '#221a14',
  ink: '#f0e6d8',
  muted: '#9a8a7a',
  rule: '#f0e6d8',
  accentStatic: '#ff5a3c',
  accent: '#ff5a3c',
  primary: '#b8485c',
  onPrimary: '#fff6e8',
  red: '#d86a7b',
  ratingTone: {
    5: '#e8b84d',
    4: '#d99a4a',
    3: '#b0a098',
    2: '#c0757d',
    1: '#c06470',
  },
};

// Back-compat alias: unmigrated files continue to compile against the day palette.
export const editorialColors = dayPalette;

export const accentFlow = ['#ff4a2e', '#ff2e8b', '#7b3ff2', '#d9a441', '#ff4a2e'] as const;

export const ratingTone: Record<RatingScore, string> = {
  5: '#d9a441',
  4: '#c98a3c',
  3: '#9c8b86',
  2: '#a8636b',
  1: '#8e3b46',
};

export const ratingToneNight: Record<RatingScore, string> = {
  5: '#e8b84d',
  4: '#d99a4a',
  3: '#b0a098',
  2: '#c0757d',
  1: '#a84d5a',
};

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

export const editorialType = {
  display34: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 34,
    lineHeight: 34,
    letterSpacing: 0,
  },
  monoKicker: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: tracking.kicker,
  },
  monoLabel: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: tracking.label,
  },
  proseReason: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 17,
    lineHeight: 25,
  },
  proseSmall: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  archiveMasthead: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 54,
    lineHeight: 50,
    letterSpacing: 0,
  },
  archiveContents: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    lineHeight: 22,
    letterSpacing: 0,
  },
  archiveIssue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: tracking.micro,
  },
  archiveTitle: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    lineHeight: 23,
    letterSpacing: 0,
  },
  archiveMeta: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: tracking.micro,
  },
} as const;

export const zIndex = {
  safeAreaPatch: 10,
  coverPlate: 1,
  titleOverCover: 2,
  markers: 3,
  grain: 20,
} as const;

export const touchTarget = {
  min: 44,
} as const;
