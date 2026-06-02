import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { LibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import type { ProfileOverview } from '@/lib/hooks/useProfileOverview';
import type { AlbumDiscovery, RatingScore } from '@/lib/recommendation';
import { useSkinComponents } from '@/theme/skins/registry';
import type { ProfileViewProps } from '@/theme/skins/types';

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
    issue_number: id.length + 1,
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

const now = '2026-06-02T08:00:00.000Z';

const richOverview: ProfileOverview = {
  streak: 42,
  total_discovered: 389,
  taste: {
    top_artists: [
      { name: 'The International Committee for Beautifully Overlong Artist Names', count: 37 },
      { name: 'A Certain Ratio Reimagined By The Studio Orchestra', count: 29 },
      { name: 'Nala Sinephro', count: 24 },
      { name: 'Beverly Glenn-Copeland', count: 21 },
      { name: 'Mabe Fratti and the Very Patient Cellos', count: 18 },
      { name: 'The Comet Is Coming', count: 15 },
    ],
    decades: [
      { decade: 1970, count: 31 },
      { decade: 1980, count: 18 },
      { decade: 1990, count: 9 },
      { decade: 2000, count: 22 },
      { decade: 2010, count: 44 },
      { decade: 2020, count: 58 },
    ],
    span_min: 1968,
    span_max: 2026,
  },
  listening: {
    rated_this_month: 13,
    loved_count: 47,
    avg_score: 4.4,
    total_rated: 121,
  },
  library_stats: {
    albums_tracked: 142,
    last_synced_at: now,
  },
};

const emptyOverview: ProfileOverview = {
  streak: 0,
  total_discovered: 2,
  taste: {
    top_artists: [],
    decades: [],
    span_min: null,
    span_max: null,
  },
  listening: {
    rated_this_month: 0,
    loved_count: 0,
    avg_score: null,
    total_rated: 0,
  },
  library_stats: {
    albums_tracked: null,
    last_synced_at: null,
  },
};

function syncStatus(
  status: LibrarySyncStatus['status'],
  overrides: Partial<LibrarySyncStatus> = {},
): LibrarySyncStatus {
  return {
    aggregated_albums_count: status === 'completed' ? 142 : null,
    completed_at: status === 'completed' ? now : null,
    error_code: null,
    error_message: null,
    processed_count: status === 'syncing' ? 74 : 0,
    provider: 'spotify',
    saved_albums_count: null,
    saved_tracks_count: null,
    started_at: now,
    status,
    total_estimate: status === 'syncing' ? 220 : null,
    updated_at: now,
    user_id: 'fixture-user',
    ...overrides,
  };
}

function profileFixtureProps(
  name: string,
  overview: ProfileOverview | null,
  overrides: Partial<ProfileViewProps> = {},
): ProfileViewProps {
  return {
    profile: {
      display_name: name,
      avatar_url: covers.bright,
    },
    profileLoading: false,
    connection: {
      provider: 'spotify',
      connected_at: '2026-05-01T12:00:00.000Z',
      spotify_product: 'premium',
    },
    overview,
    overviewLoading: false,
    libraryStats: { albumsTracked: 142, lastSyncedAt: '2026-06-02T07:45:00.000Z' },
    libraryStatsLoading: false,
    syncStatus: syncStatus('completed'),
    isSyncing: false,
    onSyncNow: () => undefined,
    onSignOut: () => undefined,
    onOpenRatedDiscoveries: () => undefined,
    refreshing: false,
    onRefresh: () => undefined,
    product: 'Premium',
    heroSubtitle: overview
      ? `${overview.streak}-day streak / ${overview.total_discovered} albums discovered`
      : 'Your taste, one album at a time',
    ...overrides,
  };
}

const profileFixtures = [
  {
    title: 'Profile / rich identity',
    props: profileFixtureProps(
      'Cassandra With A Display Name Long Enough To Stress The Masthead',
      richOverview,
    ),
  },
  {
    title: 'Profile / empty low data',
    props: profileFixtureProps('Spotify listener', emptyOverview, {
      profile: { display_name: null, avatar_url: null },
      libraryStats: { albumsTracked: 8, lastSyncedAt: '2026-06-01T18:20:00.000Z' },
    }),
  },
  {
    title: 'Profile / syncing',
    props: profileFixtureProps('Sync QA Listener', richOverview, {
      syncStatus: syncStatus('syncing'),
      isSyncing: true,
    }),
  },
  {
    title: 'Profile / failed free account',
    props: profileFixtureProps('Free Account Listener With Long Name', richOverview, {
      product: 'Free',
      connection: {
        provider: 'spotify',
        connected_at: '2026-05-20T10:00:00.000Z',
        spotify_product: 'free',
      },
      syncStatus: syncStatus('failed', {
        error_code: 'spotify_rate_limited',
        error_message: 'raw backend detail should not be shown in the primary surface',
      }),
    }),
  },
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
      {profileFixtures.map((fixtureItem) => (
        <View key={fixtureItem.title} className="gap-3">
          <Text variant="caption">{fixtureItem.title}</Text>
          <View
            className="h-[760px] overflow-hidden border-2"
            style={{ borderColor: components.chrome.text }}
          >
            <components.ProfileView {...fixtureItem.props} />
          </View>
        </View>
      ))}
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
