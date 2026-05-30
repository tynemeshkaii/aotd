import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { copy } from '@/lib/copy';
import type { ProfileOverview } from '@/lib/hooks/useProfileOverview';
import colors from '@/theme/colors';

type Props = {
  listening: ProfileOverview['listening'];
  onPress: () => void;
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text variant="h2">{value}</Text>
      <Text variant="subtle" className="mt-1 text-center">
        {label}
      </Text>
    </View>
  );
}

export function ListeningSummary({ listening, onPress }: Props) {
  const hasRatings = listening.total_rated > 0;

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Text variant="h3">{copy.profile.listeningTitle}</Text>
        {hasRatings && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View rated discoveries"
            onPress={onPress}
            className="flex-row items-center gap-1 active:opacity-70"
          >
            <Text variant="caption" className="text-accent">
              View all
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.accent} />
          </Pressable>
        )}
      </View>

      {hasRatings ? (
        <View className="mt-4 flex-row">
          <Stat value={String(listening.rated_this_month)} label="rated this month" />
          <Stat value={String(listening.loved_count)} label="loved" />
          <Stat
            value={listening.avg_score != null ? Number(listening.avg_score).toFixed(1) : '—'}
            label="avg score"
          />
        </View>
      ) : (
        <Text variant="caption" className="mt-3 leading-5">
          {copy.profile.listeningEmpty}
        </Text>
      )}
    </Card>
  );
}
