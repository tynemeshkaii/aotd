import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { EditorialActionButton } from '@/components/skins/editorial/EditorialActionButton';
import { EditorialSectionRule } from '@/components/skins/editorial/EditorialSectionRule';
import { editorialType, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { haptics } from '@/lib/haptics';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { useSaveRating } from '@/lib/hooks/useSaveRating';
import { type AlbumDiscovery, RATING_OPTIONS, type RatingScore } from '@/lib/recommendation';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';
import { EditorialStamp } from './shared';

const type = editorialType;

function RatingCell({
  option,
  index,
  selected,
  onSelect,
}: {
  option: (typeof RATING_OPTIONS)[number];
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const palette = useEditorialPalette();
  const [pressed, setPressed] = React.useState(false);
  const reduceMotion = useReduceMotion();
  const fill = useSharedValue(selected ? 1 : 0);

  React.useEffect(() => {
    fill.value = withTiming(selected ? 1 : 0, { duration: reduceMotion ? 0 : 140 });
  }, [fill, reduceMotion, selected]);

  const fillStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scaleX: fill.value }],
  }));
  const shouldScale = pressed && !reduceMotion;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Rate this album: ${option.label}`}
      accessibilityState={{ selected }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        setPressed(false);
        onSelect();
      }}
      className="min-h-12 flex-row items-center gap-3 overflow-hidden px-3 py-2"
      style={{
        borderTopWidth: index === 0 ? 0 : 1,
        borderTopColor: palette.ink,
        transform: [{ scale: shouldScale ? 0.98 : 1 }],
      }}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-0"
        style={[{ backgroundColor: palette.ink }, fillStyle]}
      />
      <Text
        className="w-8 font-mono-bold text-xs uppercase"
        style={{
          color: selected ? palette.ratingTone[option.score] : palette.muted,
          letterSpacing: tracking.label,
          zIndex: 1,
        }}
      >
        {selected ? 'X' : `0${option.score}`}
      </Text>
      <Text
        className="flex-1 font-prose-bold text-base leading-5"
        style={{
          color: selected ? palette.paper : palette.ink,
          zIndex: 1,
        }}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

export function EditorialRatingEditor({ album }: { album: AlbumDiscovery }) {
  const palette = useEditorialPalette();
  const [score, setScore] = React.useState<RatingScore | null>(album.rating_score);
  const [comment, setComment] = React.useState(album.rating_comment ?? '');
  const saveRating = useSaveRating(album.aotd_id);
  const dirty = score !== album.rating_score || comment !== (album.rating_comment ?? '');
  const statusLabel = saveRating.isPending
    ? 'Saving note...'
    : saveRating.isError
      ? 'Save failed. Try again.'
      : album.rating_id && !dirty
        ? 'Saved in your private journal'
        : dirty
          ? 'Unsaved changes'
          : 'Ready when you are';

  React.useEffect(() => {
    setScore(album.rating_score);
    setComment(album.rating_comment ?? '');
  }, [album.rating_score, album.rating_comment]);

  const save = () => {
    if (!score) return;
    saveRating.mutate(
      { score, comment },
      {
        onSuccess: () => haptics.success(),
        onError: () => haptics.warning(),
      },
    );
  };

  return (
    <View className="gap-4">
      <EditorialSectionRule title="Editorial ballot" major />
      {album.rating_score ? <EditorialStamp label={`Rated 0${album.rating_score}`} /> : null}
      <Text
        className="uppercase"
        style={[
          type.monoKicker,
          {
            color: palette.muted,
            fontSize: 10,
            lineHeight: 16,
            letterSpacing: tracking.label,
          },
        ]}
      >
        Private journal only · does not tune tomorrow's pick
      </Text>
      <View className="border-2" style={{ borderColor: palette.ink }}>
        {RATING_OPTIONS.map((option, index) => {
          const selected = score === option.score;
          return (
            <RatingCell
              key={option.score}
              option={option}
              index={index}
              selected={selected}
              onSelect={() => {
                haptics.selection();
                setScore(option.score);
              }}
            />
          );
        })}
      </View>
      <View className="border-2" style={{ borderColor: palette.ink }}>
        <View
          className="flex-row items-center justify-between gap-3 border-b px-3 py-2"
          style={{ borderColor: palette.ink, backgroundColor: palette.paperAlt }}
        >
          <Text
            className="font-mono-bold text-[10px] uppercase leading-4"
            style={{ color: palette.ink, letterSpacing: tracking.label }}
          >
            Private note
          </Text>
          <Text
            className="shrink text-right font-mono text-[10px] uppercase leading-4"
            style={{
              color: saveRating.isError ? palette.red : palette.muted,
              letterSpacing: tracking.label,
            }}
            numberOfLines={1}
          >
            {statusLabel}
          </Text>
        </View>
        <TextInput
          accessibilityLabel="Private rating note"
          multiline
          value={comment}
          onChangeText={setComment}
          placeholder="Add a private note"
          placeholderTextColor={palette.muted}
          textAlignVertical="top"
          className="min-h-28 px-4 py-3 font-prose text-base leading-6"
          style={{ color: palette.ink }}
        />
      </View>
      <EditorialActionButton
        title={
          saveRating.isPending
            ? 'Saving...'
            : saveRating.isError
              ? 'Retry save'
              : album.rating_id
                ? 'Update rating'
                : 'Save rating'
        }
        onPress={save}
        disabled={!score}
        loading={saveRating.isPending}
      />
    </View>
  );
}
