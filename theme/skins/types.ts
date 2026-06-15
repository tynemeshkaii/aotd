import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode, RefObject } from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { LibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import type { ProfileOverview } from '@/lib/hooks/useProfileOverview';
import type { AlbumDiscovery } from '@/lib/recommendation';

export type SkinId = 'editorial';
export type DiscoveryFilter = 'all' | 'pending' | 'rated';

export type SkinChrome = {
  id: SkinId;
  rootBackground: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  primary: string;
  onPrimary: string;
  statusBarStyle: 'light' | 'dark';
  tabBar: {
    backgroundColor: string;
    borderTopColor: string;
    borderTopWidth: number;
    activeTintColor: string;
    inactiveTintColor: string;
    activeIndicatorColor: string;
    labelFontFamily: string;
    labelFontSize: number;
    iconSize: number;
  };
};

export type AlbumDetailViewProps = {
  album: AlbumDiscovery;
  isToday?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  scrollY: SharedValue<number>;
  reduceMotion: boolean;
  topInset: number;
  bottomInset: number;
  opening: boolean;
  sharing: boolean;
  onOpen: () => void;
  onShare: () => void;
  isFreeSpotify: boolean;
  /** Pull-to-refresh: only wired for today's Home pick. */
  refreshing?: boolean;
  onRefresh?: () => void;
};

export type DiscoveriesViewProps = {
  filter: DiscoveryFilter;
  onFilterChange: (filter: DiscoveryFilter) => void;
  discoveries: AlbumDiscovery[];
  filtered: AlbumDiscovery[];
  loading: boolean;
  error: boolean;
  retrying: boolean;
  onRetry: () => void;
  onOpenDiscovery: (album: AlbumDiscovery) => void;
  emptyTitle: string;
  emptySubtitle: string;
};

export type ProfileViewProps = {
  profile?: { display_name: string | null; avatar_url: string | null } | null;
  profileLoading: boolean;
  connection?: {
    provider: string | null;
    connected_at: string | null;
    spotify_product: string | null;
  } | null;
  overview?: ProfileOverview | null;
  overviewLoading: boolean;
  libraryStats?: { albumsTracked: number | null; lastSyncedAt: string | null } | null;
  libraryStatsLoading: boolean;
  syncStatus?: LibrarySyncStatus | null;
  isSyncing: boolean;
  onSyncNow: () => void;
  onSignOut: () => void;
  onOpenRatedDiscoveries: () => void;
  product: string | null;
  heroSubtitle: string;
  refreshing: boolean;
  onRefresh: () => void;
};

export type SignInViewProps = {
  loading: boolean;
  onSignIn: () => void;
};

export type InitialSyncingViewProps = {
  isFailed: boolean;
  isStale: boolean;
  isStarting: boolean;
  processed: number;
  total: number;
  ratio: number;
  showStartRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
};

export type ShareCardProps = {
  album: AlbumDiscovery;
};

export type SyncBannerProps = {
  style?: StyleProp<ViewStyle>;
  status?: LibrarySyncStatus | null;
};

export type StatesComponentSet = {
  AlbumDetailSkeleton: () => ReactNode;
  PickError: (props: { onRetry: () => void; retrying?: boolean }) => ReactNode;
  WaitingForPick: (props?: {
    syncCompleted?: boolean;
    isFirstPick?: boolean;
    libraryAlbumCount?: number;
  }) => ReactNode;
  EmptyState: (props: {
    title: string;
    subtitle?: string;
    icon?: ComponentProps<typeof Ionicons>['name'];
    actionTitle?: string;
    onAction?: () => void;
  }) => ReactNode;
  ErrorState: (props: {
    title: string;
    retrying?: boolean;
    onRetry?: () => void;
    secondaryTitle?: string;
    onSecondary?: () => void;
  }) => ReactNode;
};

export type SkinComponentSet = {
  chrome: SkinChrome;
  AlbumDetailView: (props: AlbumDetailViewProps) => ReactNode;
  DiscoveriesView: (props: DiscoveriesViewProps) => ReactNode;
  ProfileView: (props: ProfileViewProps) => ReactNode;
  SignInView: (props: SignInViewProps) => ReactNode;
  InitialSyncingView: (props: InitialSyncingViewProps) => ReactNode;
  ShareCard: (props: ShareCardProps) => ReactNode;
  SyncBanner: (props: SyncBannerProps) => ReactNode;
  States: StatesComponentSet;
};

export type ShareCardRef = RefObject<View | null>;
