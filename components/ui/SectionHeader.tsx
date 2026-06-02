import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from './Text';

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, subtitle, action, className }: Props) {
  return (
    <View className={`flex-row items-start justify-between gap-4 ${className ?? ''}`}>
      <View className="min-w-0 flex-1">
        <Text variant="sectionTitle">{title}</Text>
        {subtitle ? (
          <Text variant="caption" className="mt-1">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View className="min-h-11 justify-center">{action}</View> : null}
    </View>
  );
}
