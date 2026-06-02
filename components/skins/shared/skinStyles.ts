import type { RatingScore } from '@/lib/recommendation';

export const editorialColors = {
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
};

export const accentFlow = ['#ff4a2e', '#ff2e8b', '#7b3ff2', '#d9a441', '#ff4a2e'] as const;

export const ratingTone: Record<RatingScore, string> = {
  5: '#d9a441',
  4: '#c98a3c',
  3: '#9c8b86',
  2: '#a8636b',
  1: '#8e3b46',
};
