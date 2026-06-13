import type { DiscoveryFilter } from '@/components/album/StatusTabs';
import {
  type AlbumDiscovery,
  formatAlbumDuration,
  formatArtistCountry,
} from '@/lib/recommendation';

export const filterLabels: Record<DiscoveryFilter, string> = {
  all: 'All',
  pending: 'Waiting',
  rated: 'Rated',
};

export function formatIssueDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function issueNo(album: AlbumDiscovery) {
  return Math.max(1, album.issue_number);
}

export function albumSpec(album: AlbumDiscovery) {
  // Year + country live on the cover chips; the spec line stays artist/tracks/duration.
  return [
    album.album_primary_artist_name,
    album.album_total_tracks ? `${album.album_total_tracks} tracks` : null,
    formatAlbumDuration(album.album_duration_ms),
  ].filter((item): item is string => Boolean(item));
}

export function albumCoverMarkers(album: AlbumDiscovery) {
  return [
    album.album_release_year?.toString(),
    formatArtistCountry(album.album_artist_country),
  ].filter((item): item is string => Boolean(item));
}

export type ArchiveListItem =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; album: AlbumDiscovery; firstInGroup: boolean; isLast: boolean };

export function monthLabel(pickDate: string) {
  return new Date(`${pickDate}T12:00:00`)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();
}

export function buildArchiveItems(albums: AlbumDiscovery[]): ArchiveListItem[] {
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
