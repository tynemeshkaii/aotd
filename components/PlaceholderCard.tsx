import { View } from 'react-native';

import { Text } from './ui/Text';

type Props = {
  title: string;
  description?: string;
};

export function PlaceholderCard({ title, description }: Props) {
  return (
    <View className="bg-surface rounded-2xl p-5 border border-surface-2">
      <Text variant="h2">{title}</Text>
      {description ? (
        <Text variant="caption" className="mt-2">
          {description}
        </Text>
      ) : null}
    </View>
  );
}
