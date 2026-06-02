import { EmptyState } from '@/components/ui/EmptyState';

export function WaitingForPick() {
  return (
    <EmptyState
      icon="hourglass-outline"
      title="Your pick is brewing..."
      subtitle="We are catching up for today. Check back in a few minutes."
    />
  );
}
