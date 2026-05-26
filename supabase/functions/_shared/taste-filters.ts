const LOW_SIGNAL_ARTIST_NAMES = new Set([
  'unknown',
  'unknown artist',
  'various',
  'various artist',
  'various artists',
  'va',
]);

const LOW_SIGNAL_ARTIST_PATTERNS = [
  /^original\s+(motion\s+picture\s+)?soundtrack$/i,
  /^original\s+cast$/i,
  /^original\s+broadway\s+cast$/i,
  /^the\s+original\s+cast$/i,
];

export function normalizeTasteArtistName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function isUsableTasteArtist(name: string | null | undefined): name is string {
  if (!name) return false;
  const normalized = normalizeTasteArtistName(name);
  if (!normalized) return false;
  if (LOW_SIGNAL_ARTIST_NAMES.has(normalized)) return false;
  return !LOW_SIGNAL_ARTIST_PATTERNS.some((pattern) => pattern.test(name.trim()));
}
