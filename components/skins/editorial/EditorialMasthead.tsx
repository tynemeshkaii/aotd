import { View } from 'react-native';

import { ruleWeight, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

type EditorialMastheadProps = {
  issueLabel?: string;
  dateLabel?: string;
  rule?: keyof typeof ruleWeight;
};

export function EditorialMasthead({
  issueLabel,
  dateLabel,
  rule = 'rule',
}: EditorialMastheadProps) {
  const palette = useEditorialPalette();
  const aside = [issueLabel, dateLabel].filter(Boolean).join(' / ');

  return (
    <View accessibilityRole="header">
      <View className="flex-row items-center justify-between gap-4">
        <Text
          className="shrink font-mono-bold text-[11px] uppercase leading-4"
          style={{ color: palette.ink, letterSpacing: tracking.label }}
          maxFontSizeMultiplier={1.3}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          Album of the Day
        </Text>
        {aside ? (
          <Text
            className="shrink-0 text-right font-mono text-[11px] uppercase leading-4"
            style={{ color: palette.muted, letterSpacing: tracking.label }}
            maxFontSizeMultiplier={1.3}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {aside}
          </Text>
        ) : null}
      </View>
      <View className="mt-2" style={{ height: ruleWeight[rule], backgroundColor: palette.ink }} />
    </View>
  );
}
