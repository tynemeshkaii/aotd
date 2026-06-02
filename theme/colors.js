// Single source of truth for the app color palette.
//
// Both `tailwind.config.js` (via require) and app/TS code (via the typed
// default import in `theme/colors.d.ts`) read from here, so there is exactly
// one place to change colors.
//
// PRESS editorial palette. These tokens are intentionally aligned with the
// shipping editorial skin so generic fallback UI cannot drift back into the old
// dark/rounded brand treatment.
const colors = {
  // Core surfaces
  bg: '#f4ebe0', // warm paper
  surface: '#f4ebe0',
  'surface-2': '#eadcc9', // paper alternate / skeleton base
  // Content
  text: '#1d1511',
  muted: '#6f5d52',
  // Brand
  accent: '#ff4a2e',
  primary: '#87263b',
  'on-primary': '#fff6e8',
  // Spotify brand green — for the Spotify-branded sign-in button ONLY.
  spotify: '#1db954',
  // Rating semantic tints (subtle accents, not the primary visual)
  'rate-loved': '#d9a441', // gold
  'rate-liked': '#c98a3c',
  'rate-alright': '#9c8b86',
  'rate-notforme': '#a8636b',
  'rate-bad': '#8e3b46',
};

module.exports = colors;
