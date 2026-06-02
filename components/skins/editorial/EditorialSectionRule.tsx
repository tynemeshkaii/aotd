import { View, type ViewProps } from 'react-native';

import { editorialColors } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';

type Props = ViewProps & {
  title?: string;
  aside?: string;
  major?: boolean;
};

export function EditorialSectionRule({ title, aside, major = false, style, ...rest }: Props) {
  return (
    <View {...rest} className="flex-row items-center gap-3" style={[{ minHeight: 24 }, style]}>
      {title ? (
        <Text
          className="font-mono-bold text-[11px] uppercase leading-4"
          style={{ color: editorialColors.ink, letterSpacing: 0.8 }}
        >
          {title}
        </Text>
      ) : null}
      <View
        className="flex-1"
        style={{ height: major ? 2 : 1, backgroundColor: editorialColors.rule }}
      />
      {aside ? (
        <Text
          className="font-mono text-[11px] uppercase leading-4"
          style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
        >
          {aside}
        </Text>
      ) : null}
    </View>
  );
}
