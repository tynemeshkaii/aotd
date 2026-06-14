import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';
import type { SkinComponentSet } from '@/theme/skins/types';
import { EditorialAlbumDetailView } from './views/AlbumDetailView';
import { EditorialDiscoveriesView } from './views/DiscoveriesView';
import { EditorialInitialSyncingView } from './views/InitialSyncingView';
import { EditorialOnboardingView } from './views/OnboardingView';
import { EditorialProfileView } from './views/ProfileView';
import { EditorialRecapView } from './views/RecapView';
import { EditorialShareCard } from './views/ShareCard';
import { EditorialSignInView } from './views/SignInView';
import { EditorialSyncBanner } from './views/SyncBanner';
import { AlbumDetailProofSkeleton, EditorialEmptyState, EditorialErrorState } from './views/states';

export function useEditorialSkin(): SkinComponentSet {
  const palette = useEditorialPalette();
  return {
    chrome: {
      id: 'editorial',
      rootBackground: palette.paper,
      surface: palette.paper,
      surfaceAlt: palette.paperAlt,
      text: palette.ink,
      muted: palette.muted,
      accent: palette.accentStatic,
      primary: palette.primary,
      onPrimary: palette.onPrimary,
      statusBarStyle: palette.paper === '#17120f' ? 'light' : 'dark',
      tabBar: {
        backgroundColor: palette.paper,
        borderTopColor: palette.ink,
        borderTopWidth: 2,
        activeTintColor: palette.ink,
        inactiveTintColor: palette.muted,
        activeIndicatorColor: palette.accentStatic,
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
    RecapView: EditorialRecapView,
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
}
