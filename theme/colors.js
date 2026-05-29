// Single source of truth for the app color palette.
//
// Both `tailwind.config.js` (via require) and app/TS code (via the typed
// default import in `theme/colors.d.ts`) read from here, so there is exactly
// one place to change colors. Phase 6 swaps these for the final brand palette
// (deep burgundy / cream / accent gold) — at that point `accent` stops being
// Spotify-green and nothing else needs to move.
const colors = {
  bg: '#0a0a0a',
  surface: '#171717',
  'surface-2': '#262626',
  text: '#fafafa',
  muted: '#737373',
  accent: '#1db954',
};

module.exports = colors;
