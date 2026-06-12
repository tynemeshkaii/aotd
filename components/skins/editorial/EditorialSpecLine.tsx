import { View } from 'react-native';

import { editorialColors, ruleWeight, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';

type Props = {
  items: string[];
};

export function EditorialSpecLine({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <View
      className="py-2"
      style={{
        borderTopWidth: ruleWeight.rule,
        borderBottomWidth: ruleWeight.hairline,
        borderColor: editorialColors.ink,
      }}
    >
      <Text
        className="font-mono-bold text-[11px] uppercase leading-5"
        style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
      >
        {items.join(' · ')}
      </Text>
    </View>
  );
}
