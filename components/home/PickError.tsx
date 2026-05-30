import { ErrorState } from '@/components/ui/ErrorState';

type Props = {
  onRetry: () => void;
  retrying?: boolean;
};

export function PickError({ onRetry, retrying = false }: Props) {
  return (
    <ErrorState
      title="We couldn't check today's pick."
      body="The album might be ready, but the app couldn't confirm it just now."
      retryTitle="Try again"
      retrying={retrying}
      onRetry={onRetry}
    />
  );
}
