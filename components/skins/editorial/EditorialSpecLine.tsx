import { View } from 'react-native';

import { ruleWeight, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

type Props = {
  items: string[];
};

export function EditorialSpecLine({ items }: Props) {
  const palette = useEditorialPalette();
  if (items.length === 0) return null;

  return (
    <View
      className="py-2"
      style={{
        borderTopWidth: ruleWeight.rule,
        borderBottomWidth: ruleWeight.hairline,
        borderColor: palette.ink,
      }}
    >
      <Text
        className="font-mono-bold text-[11px] uppercase leading-5"
        style={{ color: palette.ink, letterSpacing: tracking.label }}
      >
        {items.join(' · ')}
      </Text>
    </View>
  );
}
