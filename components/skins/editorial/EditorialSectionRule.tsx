import { View, type ViewProps } from 'react-native';

import { editorialColors, ruleWeight, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';

type Props = ViewProps & {
  title?: string;
  aside?: string;
  major?: boolean;
  weight?: keyof typeof ruleWeight;
};

export function EditorialSectionRule({
  title,
  aside,
  major = false,
  weight,
  style,
  ...rest
}: Props) {
  const height = ruleWeight[weight ?? (major ? 'rule' : 'hairline')];
  return (
    <View {...rest} className="flex-row items-center gap-3" style={[{ minHeight: 24 }, style]}>
      {title ? (
        <Text
          className="font-mono-bold text-[11px] uppercase leading-4"
          style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
        >
          {title}
        </Text>
      ) : null}
      <View className="flex-1" style={{ height, backgroundColor: editorialColors.rule }} />
      {aside ? (
        <Text
          className="font-mono text-[11px] uppercase leading-4"
          style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
        >
          {aside}
        </Text>
      ) : null}
    </View>
  );
}
