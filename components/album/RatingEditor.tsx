import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';
import { useSaveRating } from '@/lib/hooks/useSaveRating';
import type { AlbumDiscovery, RatingScore } from '@/lib/recommendation';
import { RATING_OPTIONS } from '@/lib/recommendation';
import colors from '@/theme/colors';

type Props = {
  album: AlbumDiscovery;
};

// Subtle per-level tint (a dot, not the primary visual — words still lead).
const RATING_TINT: Record<RatingScore, string> = {
  5: colors['rate-loved'],
  4: colors['rate-liked'],
  3: colors['rate-alright'],
  2: colors['rate-notforme'],
  1: colors['rate-bad'],
};

export function RatingEditor({ album }: Props) {
  const [score, setScore] = useState<RatingScore | null>(album.rating_score);
  const [comment, setComment] = useState(album.rating_comment ?? '');
  const [focused, setFocused] = useState(false);
  const saveRating = useSaveRating(album.aotd_id);

  useEffect(() => {
    setScore(album.rating_score);
    setComment(album.rating_comment ?? '');
  }, [album.rating_score, album.rating_comment]);

  const select = (next: RatingScore) => {
    haptics.selection();
    setScore(next);
  };

  const save = () => {
    if (!score) {
      Alert.alert('Pick a rating first.');
      return;
    }
    saveRating.mutate(
      { score, comment },
      {
        onSuccess: () => haptics.success(),
        onError: () => {
          haptics.warning();
          Alert.alert(
            'Could not save that rating right now.',
            'Your pick is still here. Please try again in a moment.',
          );
        },
      },
    );
  };

  return (
    <Card variant="subtle" className="gap-3">
      <View>
        <Text variant="sectionTitle">Journal</Text>
        <Text variant="caption" className="mt-1">
          Private to you. Ratings shape your journal, not tomorrow's pick.
        </Text>
      </View>

      <View className="gap-2">
        {RATING_OPTIONS.map((option) => {
          const selected = score === option.score;
          return (
            <Pressable
              key={option.score}
              accessibilityRole="button"
              accessibilityLabel={`Rate this album: ${option.label}`}
              accessibilityState={{ selected }}
              onPress={() => select(option.score)}
              className={`min-h-12 flex-row items-center gap-3 rounded-xl border px-4 ${
                selected ? 'border-accent bg-accent/15' : 'border-surface-2 bg-bg'
              }`}
            >
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: selected ? colors.accent : RATING_TINT[option.score] }}
              />
              <Text className={`flex-1 ${selected ? 'font-semibold text-text' : 'text-text'}`}>
                {option.label}
              </Text>
              {selected ? (
                <MotiView
                  from={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'timing', duration: 160 }}
                >
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                </MotiView>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <TextInput
        accessibilityLabel="Private rating note"
        multiline
        value={comment}
        onChangeText={setComment}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Add a private note"
        placeholderTextColor={colors.muted}
        textAlignVertical="top"
        className={`min-h-24 rounded-xl border bg-bg px-4 py-3 text-base text-text ${
          focused ? 'border-accent' : 'border-surface-2'
        }`}
      />

      <Button
        title={album.rating_id ? 'Update rating' : 'Save rating'}
        onPress={save}
        loading={saveRating.isPending}
        haptic={false}
      />
    </Card>
  );
}
