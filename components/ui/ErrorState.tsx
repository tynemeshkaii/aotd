import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import colors from '@/theme/colors';

type Props = {
  title?: string;
  body?: string;
  retryTitle?: string;
  retrying?: boolean;
  onRetry?: () => void;
  /** Optional secondary action (e.g. "Back to Discoveries"). */
  secondaryTitle?: string;
  onSecondary?: () => void;
};

/**
 * Retryable error surface. Use for RPC/network failures so they never get
 * masked as empty/"not found" states.
 */
export function ErrorState({
  title = 'Something went sideways.',
  body = 'It is on us, not you. Give it another go in a moment.',
  retryTitle = 'Try again',
  retrying = false,
  onRetry,
  secondaryTitle,
  onSecondary,
}: Props) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-surface">
        <Ionicons name="cloud-offline-outline" size={28} color={colors.muted} />
      </View>
      <Text variant="h2" className="text-center">
        {title}
      </Text>
      <Text variant="caption" className="mt-3 text-center leading-5">
        {body}
      </Text>
      {onRetry ? (
        <Button
          className="mt-7 w-full"
          title={retryTitle}
          variant="primary"
          loading={retrying}
          onPress={onRetry}
        />
      ) : null}
      {secondaryTitle && onSecondary ? (
        <Button
          className="mt-3 w-full"
          title={secondaryTitle}
          variant="ghost"
          onPress={onSecondary}
        />
      ) : null}
    </View>
  );
}
