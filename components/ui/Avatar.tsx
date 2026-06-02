import { Image, View } from 'react-native';

import { Text } from './Text';

type Props = {
  uri?: string | null;
  size?: number;
  label?: string | null;
};

export function Avatar({ uri, size = 96, label }: Props) {
  const fallback = (label?.trim()?.[0] ?? '?').toUpperCase();

  if (uri) {
    return (
      <Image
        accessibilityLabel={label ? `${label} avatar` : 'Profile avatar'}
        className="rounded-full bg-surface"
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View
      className="items-center justify-center rounded-full bg-surface-2"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text className="font-display text-3xl text-text">{fallback}</Text>
    </View>
  );
}
