import { EmptyState } from '@/components/ui/EmptyState';

type Props = {
  syncCompleted?: boolean;
  isFirstPick?: boolean;
  libraryAlbumCount?: number;
};

export function WaitingForPick({ syncCompleted, isFirstPick, libraryAlbumCount }: Props = {}) {
  if (syncCompleted && isFirstPick && (libraryAlbumCount ?? 0) >= 5) {
    return (
      <EmptyState
        icon="hourglass-outline"
        title="Building your first pick"
        subtitle="We imported your Spotify library. Now we are narrowing the first album."
      />
    );
  }

  return (
    <EmptyState
      icon="hourglass-outline"
      title="Your pick is brewing..."
      subtitle="We are catching up for today. Check back in a few minutes."
    />
  );
}
