import { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useSaveRating } from '@/lib/hooks/useSaveRating';
import type { AlbumDiscovery, RatingScore } from '@/lib/recommendation';
import { RATING_OPTIONS } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
};

export function RatingEditor({ album }: Props) {
  const [score, setScore] = useState<RatingScore | null>(album.rating_score);
  const [comment, setComment] = useState(album.rating_comment ?? '');
  const saveRating = useSaveRating(album.aotd_id);

  useEffect(() => {
    setScore(album.rating_score);
    setComment(album.rating_comment ?? '');
  }, [album.rating_score, album.rating_comment]);

  const save = () => {
    if (!score) {
      Alert.alert('Pick a rating first.');
      return;
    }
    saveRating.mutate(
      { score, comment },
      {
        onError: () => {
          Alert.alert(
            'Could not save that rating right now.',
            'Your pick is still here. Please try again in a moment.',
          );
        },
      },
    );
  };

  return (
    <View className="gap-3 rounded-lg bg-surface p-4">
      <View>
        <Text variant="h2">Journal</Text>
        <Text variant="caption" className="mt-1">
          Private to you.
        </Text>
      </View>

      <View className="gap-2">
        {RATING_OPTIONS.map((option) => {
          const selected = score === option.score;
          return (
            <Pressable
              key={option.score}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setScore(option.score)}
              className={`min-h-11 justify-center rounded-lg border px-4 ${
                selected ? 'border-accent bg-accent' : 'border-surface-2 bg-bg'
              }`}
            >
              <Text className={selected ? 'font-semibold text-bg' : 'text-text'}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        multiline
        value={comment}
        onChangeText={setComment}
        placeholder="Add a private note"
        placeholderTextColor="#737373"
        textAlignVertical="top"
        className="min-h-24 rounded-lg bg-bg px-4 py-3 text-base text-text"
      />

      <Button
        title={album.rating_id ? 'Update rating' : 'Save rating'}
        onPress={save}
        disabled={saveRating.isPending}
        className={saveRating.isPending ? 'opacity-60' : undefined}
      />
    </View>
  );
}
