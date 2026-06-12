import { View, type ViewProps } from 'react-native';

import { editorialColors, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';

type Props = ViewProps & {
  label: string;
  tone?: 'ink' | 'paper' | 'red';
  className?: string;
};

export function EditorialMarker({ label, tone = 'ink', className, style, ...rest }: Props) {
  const isInk = tone === 'ink';
  const borderColor = tone === 'red' ? editorialColors.red : editorialColors.ink;
  const backgroundColor = isInk ? editorialColors.ink : 'transparent';
  const color = isInk ? editorialColors.paper : borderColor;

  return (
    <View
      {...rest}
      className={`min-h-7 justify-center border-2 px-2 py-1 ${className ?? ''}`}
      style={[{ borderColor, backgroundColor }, style]}
    >
      <Text
        className="font-mono-bold text-[11px] uppercase leading-4"
        style={{ color, letterSpacing: tracking.label }}
      >
        {label}
      </Text>
    </View>
  );
}
