// Single source of truth for the app color palette.
//
// Both `tailwind.config.js` (via require) and app/TS code (via the typed
// default import in `theme/colors.d.ts`) read from here, so there is exactly
// one place to change colors.
//
// Phase 6 brand palette: deep burgundy / cream / accent gold. `accent` is now
// gold (highlights, active states), `primary` is burgundy (main CTAs). The only
// place that intentionally stays Spotify-green is the Spotify sign-in button.
const colors = {
  // Core surfaces (dark, warm "album-cover-y" base)
  bg: '#120a0c', // deep wine-black
  surface: '#1d1014', // raised surface
  'surface-2': '#2a181d', // higher surface / borders
  // Content
  text: '#f4ebe0', // cream (primary text / on-dark)
  muted: '#9c8b86', // warm taupe (secondary text)
  // Brand
  accent: '#d9a441', // gold — highlights, active states, eyebrows, active tab
  primary: '#87263b', // burgundy — main CTAs ("Open in Spotify")
  'on-primary': '#f4ebe0', // cream text on burgundy
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
