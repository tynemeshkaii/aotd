import { useState } from 'react';
import { Image, View } from 'react-native';

import { Text } from './Text';

type Props = {
  uri?: string | null;
  size?: number;
  label?: string | null;
  /** Round avatar (default). Set false for the square editorial treatment. */
  rounded?: boolean;
};

export function Avatar({ uri, size = 96, label, rounded = true }: Props) {
  const [failed, setFailed] = useState(false);
  const fallback = (label?.trim()?.[0] ?? '?').toUpperCase();
  const borderRadius = rounded ? size / 2 : 0;

  // Fall back to the initials block if the remote avatar fails to load
  // (404/expired URL) instead of rendering a blank box.
  if (uri && !failed) {
    return (
      <Image
        accessibilityLabel={label ? `${label} avatar` : 'Profile avatar'}
        className="bg-surface"
        source={{ uri }}
        style={{ width: size, height: size, borderRadius }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      className="items-center justify-center bg-surface-2"
      style={{ width: size, height: size, borderRadius }}
    >
      <Text className="font-display text-3xl text-text">{fallback}</Text>
    </View>
  );
}
