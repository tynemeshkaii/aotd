export function normalizeAlbumKey(
  artist: string | null | undefined,
  album: string | null | undefined,
) {
  return `${normalizeAlbumPart(artist)}::${normalizeAlbumPart(album)}`;
}

function normalizeAlbumPart(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/\b(remaster(?:ed)?|deluxe|expanded|anniversary|edition|version)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
