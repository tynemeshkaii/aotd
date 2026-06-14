import { View } from 'react-native';

import { tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { romanNumeral, type StreakSummary } from '@/lib/streak';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

type Props = {
  summary?: StreakSummary | null;
  compact?: boolean;
};

export function SubscriptionRun({ summary, compact }: Props) {
  const palette = useEditorialPalette();
  if (!summary || summary.days.length === 0) return null;

  const volume = romanNumeral(summary.volume);
  const runLabel =
    summary.consecutiveDays === 1 ? '1-day run' : `${summary.consecutiveDays}-day run`;

  return (
    <View className="gap-3 border-2 p-3" style={{ borderColor: palette.ink }}>
      <View className="flex-row items-center justify-between gap-3">
        <View>
          <Text
            className="font-mono-bold text-[10px] uppercase leading-4"
            style={{ color: palette.muted, letterSpacing: tracking.label }}
          >
            The standing order
          </Text>
          <Text
            className="font-display text-2xl uppercase leading-7"
            style={{ color: palette.ink, letterSpacing: 0 }}
          >
            {`Vol. ${volume}`}
          </Text>
        </View>
        <Text
          className="font-mono-bold text-[11px] uppercase leading-4"
          style={{ color: palette.accentStatic, letterSpacing: tracking.label }}
        >
          {runLabel}
        </Text>
      </View>

      <View className="flex-row items-end gap-1" accessible={false}>
        {summary.days.map((day) => (
          <View
            key={day.date}
            className="flex-1 border-2"
            style={{
              height: day.isToday ? 34 : 26,
              borderColor: day.isToday ? palette.accentStatic : palette.ink,
              backgroundColor: day.opened ? palette.ink : palette.paper,
            }}
          />
        ))}
      </View>

      {!compact ? (
        <Text className="font-prose text-sm leading-5" style={{ color: palette.muted }}>
          Don't break the run if today's issue is still waiting. No alarms, just a neat little row
          of spines.
        </Text>
      ) : (
        <Text
          className="font-mono text-[10px] uppercase leading-4"
          style={{ color: palette.muted, letterSpacing: tracking.label }}
        >
          Don't break the run
        </Text>
      )}
    </View>
  );
}
