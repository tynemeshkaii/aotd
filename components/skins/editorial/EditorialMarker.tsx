import { View, type ViewProps } from 'react-native';

import { tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

type Props = ViewProps & {
  label: string;
  tone?: 'ink' | 'paper' | 'red';
  className?: string;
};

export function EditorialMarker({ label, tone = 'ink', className, style, ...rest }: Props) {
  const palette = useEditorialPalette();
  const isInk = tone === 'ink';
  const borderColor = tone === 'red' ? palette.red : palette.ink;
  const backgroundColor = isInk ? palette.ink : 'transparent';
  const color = isInk ? palette.paper : borderColor;

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
