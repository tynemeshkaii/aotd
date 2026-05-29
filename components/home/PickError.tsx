import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';

type Props = {
  onRetry: () => void;
  retrying?: boolean;
};

export function PickError({ onRetry, retrying = false }: Props) {
  return (
    <View className="items-center justify-center rounded-2xl bg-surface px-5 py-10">
      <Text variant="h2" className="text-center">
        We couldn't check today's pick.
      </Text>
      <Text variant="caption" className="mt-2 text-center leading-5">
        The album might be ready, but the app couldn't confirm it just now.
      </Text>
      <Button
        className="mt-6 w-full"
        disabled={retrying}
        onPress={onRetry}
        title={retrying ? 'Checking...' : 'Try again'}
        variant="secondary"
      />
    </View>
  );
}
