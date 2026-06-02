import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
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

function moodLabel(avgScore: number | null) {
  if (avgScore == null) return 'Not yet';
  if (avgScore >= 4.5) return 'Loved it';
  if (avgScore >= 3.5) return 'Liked it';
  if (avgScore >= 2.5) return 'Alright';
  if (avgScore >= 1.5) return 'Not for me';
  return 'Bad';
}

export function ListeningSummary({ listening, onPress }: Props) {
  const hasRatings = listening.total_rated > 0;

  return (
    <Card>
      <View className="flex-row items-center justify-between gap-3">
        <SectionHeader title={copy.profile.listeningTitle} />
        {hasRatings && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View rated discoveries"
            onPress={onPress}
            className="min-h-11 flex-row items-center gap-1 active:opacity-70"
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
          <Stat value={moodLabel(listening.avg_score)} label="usual mood" />
        </View>
      ) : (
        <Text variant="caption" className="mt-3 leading-5">
          {copy.profile.listeningEmpty}
        </Text>
      )}
    </Card>
  );
}
