import { editorialColors } from '@/components/skins/shared/skinStyles';
import type { SkinComponentSet } from '@/theme/skins/types';
import { EditorialAlbumDetailView } from './views/AlbumDetailView';
import { EditorialDiscoveriesView } from './views/DiscoveriesView';
import { EditorialInitialSyncingView } from './views/InitialSyncingView';
import { EditorialOnboardingView } from './views/OnboardingView';
import { EditorialProfileView } from './views/ProfileView';
import { EditorialShareCard } from './views/ShareCard';
import { EditorialSignInView } from './views/SignInView';
import { EditorialSyncBanner } from './views/SyncBanner';
import { AlbumDetailProofSkeleton, EditorialEmptyState, EditorialErrorState } from './views/states';

export const editorialSkin: SkinComponentSet = {
  chrome: {
    id: 'editorial',
    rootBackground: editorialColors.paper,
    surface: editorialColors.paper,
    surfaceAlt: editorialColors.paperAlt,
    text: editorialColors.ink,
    muted: editorialColors.muted,
    accent: editorialColors.accentStatic,
    primary: editorialColors.primary,
    onPrimary: editorialColors.onPrimary,
    statusBarStyle: 'dark',
    tabBar: {
      backgroundColor: editorialColors.paper,
      borderTopColor: editorialColors.ink,
      borderTopWidth: 2,
      activeTintColor: editorialColors.ink,
      inactiveTintColor: editorialColors.muted,
      activeIndicatorColor: editorialColors.accentStatic,
      labelFontFamily: 'Archivo_600SemiBold',
      labelFontSize: 12,
      iconSize: 26,
    },
  },
  AlbumDetailView: EditorialAlbumDetailView,
  DiscoveriesView: EditorialDiscoveriesView,
  ProfileView: EditorialProfileView,
  SignInView: EditorialSignInView,
  OnboardingView: EditorialOnboardingView,
  InitialSyncingView: EditorialInitialSyncingView,
  ShareCard: EditorialShareCard,
  SyncBanner: EditorialSyncBanner,
  States: {
    AlbumDetailSkeleton: AlbumDetailProofSkeleton,
    PickError: ({ onRetry, retrying }) => (
      <EditorialErrorState
        title="Could not check today's pick."
        retrying={retrying}
        onRetry={onRetry}
      />
    ),
    WaitingForPick: (props) => {
      const isFirstReady =
        props?.syncCompleted && props?.isFirstPick && (props?.libraryAlbumCount ?? 0) >= 5;
      return (
        <EditorialEmptyState
          title={isFirstReady ? 'Building your first pick' : 'Your pick is brewing'}
          subtitle={
            isFirstReady
              ? 'We imported your Spotify library. Now we are narrowing the first album.'
              : 'Should be ready by your usual push time. Check back soon.'
          }
        />
      );
    },
    EmptyState: EditorialEmptyState,
    ErrorState: EditorialErrorState,
  },
};
