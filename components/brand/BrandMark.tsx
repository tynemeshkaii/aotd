import { View, type ViewProps } from 'react-native';

import colors from '@/theme/colors';

type Props = ViewProps & {
  size?: number;
  muted?: boolean;
};

export function BrandMark({ size = 56, muted = false, style, ...rest }: Props) {
  const sleeve = size;
  const record = size * 0.72;
  const ring = record * 0.5;
  const dot = record * 0.16;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: sleeve, height: sleeve }, style]}
      {...rest}
    >
      <View
        className="absolute inset-0"
        style={{ backgroundColor: muted ? colors.surface : colors.primary }}
      />
      <View
        className="absolute right-[10%] top-[10%] rounded-full"
        style={{
          width: record,
          height: record,
          backgroundColor: colors.bg,
          borderColor: muted ? colors.muted : colors.accent,
          borderWidth: Math.max(2, size * 0.045),
        }}
      />
      <View
        className="absolute rounded-full"
        style={{
          width: ring,
          height: ring,
          right: sleeve * 0.1 + (record - ring) / 2,
          top: sleeve * 0.1 + (record - ring) / 2,
          borderColor: colors.surface,
          borderWidth: Math.max(1, size * 0.025),
        }}
      />
      <View
        className="absolute rounded-full"
        style={{
          width: dot,
          height: dot,
          right: sleeve * 0.1 + (record - dot) / 2,
          top: sleeve * 0.1 + (record - dot) / 2,
          backgroundColor: muted ? colors.muted : colors.accent,
        }}
      />
      <View
        className="absolute left-[14%] top-[14%] rounded-full"
        style={{
          width: size * 0.16,
          height: size * 0.16,
          backgroundColor: colors.accent,
        }}
      />
    </View>
  );
}
