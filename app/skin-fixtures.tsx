import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { AlbumDiscovery, RatingScore } from '@/lib/recommendation';
import { useSkinComponents } from '@/theme/skins/registry';

const covers = {
  dark: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=900&q=80',
  bright: 'https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=900&q=80',
  saturated: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=900&q=80',
  busy: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=80',
};

function fixture(
  id: string,
  title: string,
  cover: string | null,
  rating: RatingScore | null,
): AlbumDiscovery {
  return {
    aotd_id: `fixture-${id}`,
    pick_date: '2026-05-31',
    status: rating ? 'rated' : id.includes('opened') ? 'opened' : 'pending',
    is_fallback: false,
    fallback_reason: null,
    selection_reason: {
      is_fallback: false,
      primary_source_artist: 'A Very Specific Artist With A Long Name',
      secondary_source_artists: ['Another Long Artist Name'],
      message:
        "Picked because you've been saving noisy, tender, oddly shaped records from nearby artists. We hope this one behaves.",
    },
    opened_at: null,
    album_id: `album-${id}`,
    album_title: title,
    album_primary_artist_name:
      id === 'long'
        ? 'The International Committee for Beautifully Overlong Artist Names'
        : 'Fixture Artist',
    album_artist_country: id === 'missing' ? null : id === 'bright' ? 'GB' : 'US',
    album_cover_url: cover,
    album_spotify_id: `fixtureSpotify${id}`,
    album_release_year: 2026,
    album_total_tracks: 11,
    album_duration_ms: 43 * 60 * 1000,
    rating_id: rating ? `rating-${id}` : null,
    rating_score: rating,
    rating_comment: rating ? 'Fixture note for layout testing.' : null,
    rating_created_at: null,
    rating_updated_at: null,
  };
}

const fixtures = [
  fixture('dark', 'Black Cover Test', covers.dark, 5),
  fixture('bright', 'Near White Cover Test', covers.bright, 4),
  fixture('saturated', 'Saturated Color Field', covers.saturated, 3),
  fixture('busy', 'Busy Multicolor Landscape With Plenty Going On', covers.busy, 2),
  fixture('missing', 'Missing Artwork Placeholder', null, 1),
  fixture(
    'long',
    'A Very Long Album Title That Needs To Wrap With Intention And Never Crush The Controls',
    covers.saturated,
    null,
  ),
];

export default function SkinFixturesScreen() {
  const components = useSkinComponents();

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
      style={{ backgroundColor: components.chrome.rootBackground }}
    >
      <Text variant="screenTitle">Editorial Fixtures</Text>
      <Text variant="caption">Temporary gallery for editorial QA.</Text>
      {fixtures.map((album, index) => (
        <View key={album.aotd_id}>
          <components.DiscoveriesView
            filter="all"
            onFilterChange={() => undefined}
            discoveries={[album]}
            filtered={[album]}
            loading={false}
            error={false}
            retrying={false}
            onRetry={() => undefined}
            onOpenDiscovery={() => undefined}
            emptyTitle="No fixtures"
            emptySubtitle="Fixture suite"
          />
          {index === 0 ? (
            <View className="mt-4 overflow-hidden rounded-xl" style={{ height: 360 }}>
              <components.ShareCard album={album} />
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
