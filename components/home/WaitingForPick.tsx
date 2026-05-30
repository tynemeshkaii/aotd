import { EmptyState } from '@/components/ui/EmptyState';

export function WaitingForPick() {
  return (
    <EmptyState
      icon="hourglass-outline"
      title="Your pick is brewing..."
      subtitle="Should be ready by your usual push time. Check back soon."
    />
  );
}
