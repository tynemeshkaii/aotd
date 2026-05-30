import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import colors from '@/theme/colors';

type Props = {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  actionTitle?: string;
  onAction?: () => void;
};

/**
 * Intentional empty state: a calm centered block with optional action.
 * Copy should follow the tone guide (humor + low pressure).
 */
export function EmptyState({
  icon = 'sparkles-outline',
  title,
  subtitle,
  actionTitle,
  onAction,
}: Props) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-surface">
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <Text variant="h2" className="text-center">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" className="mt-3 text-center leading-5">
          {subtitle}
        </Text>
      ) : null}
      {actionTitle && onAction ? (
        <Button className="mt-7" title={actionTitle} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}
