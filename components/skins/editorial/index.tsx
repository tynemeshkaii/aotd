import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import * as React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DiscoveryFilter } from '@/components/album/StatusTabs';
import { SpotifyButton } from '@/components/auth/SpotifyButton';
import { BrandMark } from '@/components/brand/BrandMark';
import { AccentRule } from '@/components/skins/editorial/accent/AccentRule';
import { AccentText } from '@/components/skins/editorial/accent/AccentText';
import { EditorialAlbumActions } from '@/components/skins/editorial/EditorialAlbumActions';
import { EditorialMarker } from '@/components/skins/editorial/EditorialMarker';
import { EditorialSectionRule } from '@/components/skins/editorial/EditorialSectionRule';
import { EditorialSpecLine } from '@/components/skins/editorial/EditorialSpecLine';
import { editorialColors, ratingTone } from '@/components/skins/shared/skinStyles';
import { Avatar } from '@/components/ui/Avatar';
import { CoverImage } from '@/components/ui/CoverImage';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { copy } from '@/lib/copy';
import { relativeTime } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { type LibrarySyncStatus, useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { useSaveRating } from '@/lib/hooks/useSaveRating';
import { isStaleLibrarySync } from '@/lib/library';
import { getPageBottomPadding, getTabContentBottomPadding } from '@/lib/navigationChrome';
import {
  type AlbumDiscovery,
  formatAlbumDuration,
  formatArtistCountry,
  formatSelectionReason,
  getDiscoveryStatusLabel,
  RATING_OPTIONS,
  type RatingScore,
  spotifyAlbumUrl,
} from '@/lib/recommendation';
import type { SkinComponentSet } from '@/theme/skins/types';

const filterLabels: Record<DiscoveryFilter, string> = {
  all: 'All',
  pending: 'Waiting',
  rated: 'Rated',
};

const skeletonRows = ['one', 'two', 'three', 'four', 'five', 'six'];
const seenDiscoveryRows = new Set<string>();

const type = {
  display34: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 34,
    lineHeight: 32,
    letterSpacing: 0,
  },
  monoKicker: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.43,
  },
  monoLabel: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.32,
  },
  proseReason: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 17,
    lineHeight: 25,
  },
  proseSmall: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  archiveMasthead: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 54,
    lineHeight: 50,
    letterSpacing: 0,
  },
  archiveContents: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    lineHeight: 22,
    letterSpacing: 0,
  },
  archiveIssue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
  },
  archiveTitle: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    lineHeight: 23,
    letterSpacing: 0,
  },
  archiveMeta: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.95,
  },
} satisfies Record<string, TextStyle>;

function formatIssueDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function issueNo(album: AlbumDiscovery) {
  return Math.max(1, album.issue_number);
}

function albumSpec(album: AlbumDiscovery) {
  // Year + country live on the cover chips; the spec line stays artist/tracks/duration.
  return [
    album.album_primary_artist_name,
    album.album_total_tracks ? `${album.album_total_tracks} tracks` : null,
    formatAlbumDuration(album.album_duration_ms),
  ].filter((item): item is string => Boolean(item));
}

function albumCoverMarkers(album: AlbumDiscovery) {
  return [
    album.album_release_year?.toString(),
    formatArtistCountry(album.album_artist_country),
  ].filter((item): item is string => Boolean(item));
}

function EditorialActionButton({
  title,
  onPress,
  loading,
  disabled,
  tone = 'ink',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'ink' | 'paper' | 'red';
}) {
  const isDisabled = disabled || loading;
  const borderColor = tone === 'red' ? editorialColors.red : editorialColors.ink;
  const backgroundColor = tone === 'ink' ? editorialColors.ink : 'transparent';
  const foregroundColor =
    tone === 'ink'
      ? editorialColors.paper
      : tone === 'red'
        ? editorialColors.red
        : editorialColors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={() => {
        haptics.impactLight();
        onPress();
      }}
      className={`min-h-12 flex-row items-center justify-center gap-2 border-2 px-4 py-3 active:opacity-70 ${
        isDisabled ? 'opacity-60' : ''
      }`}
      style={{
        borderColor,
        backgroundColor,
      }}
    >
      {loading ? <ActivityIndicator color={foregroundColor} size="small" /> : null}
      <Text
        className="font-mono-bold text-xs uppercase leading-4"
        style={{
          color: foregroundColor,
          letterSpacing: 0.8,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function EditorialWhyRule() {
  return (
    <View className="flex-row items-center gap-[10px]">
      <Text className="uppercase" style={[type.monoLabel, { color: editorialColors.ink }]}>
        Why this one?
      </Text>
      <View className="h-[3px] flex-1" style={{ backgroundColor: editorialColors.ink }} />
    </View>
  );
}

function EditorialRatingEditor({ album }: { album: AlbumDiscovery }) {
  const [score, setScore] = React.useState<RatingScore | null>(album.rating_score);
  const [comment, setComment] = React.useState(album.rating_comment ?? '');
  const saveRating = useSaveRating(album.aotd_id);

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
      <Text
        className="uppercase"
        style={[
          type.monoKicker,
          { color: editorialColors.muted, fontSize: 10, lineHeight: 16, letterSpacing: 0.9 },
        ]}
      >
        Private journal only · does not tune tomorrow's pick
      </Text>
      <View className="border-2" style={{ borderColor: editorialColors.ink }}>
        {RATING_OPTIONS.map((option, index) => {
          const selected = score === option.score;
          return (
            <Pressable
              key={option.score}
              accessibilityRole="button"
              accessibilityLabel={`Rate this album: ${option.label}`}
              accessibilityState={{ selected }}
              onPress={() => {
                haptics.selection();
                setScore(option.score);
              }}
              className="min-h-12 flex-row items-center gap-3 px-3 py-2 active:opacity-75"
              style={{
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: editorialColors.ink,
                backgroundColor: selected ? editorialColors.ink : 'transparent',
              }}
            >
              <Text
                className="w-8 font-mono-bold text-xs uppercase"
                style={{
                  color: selected ? ratingTone[option.score] : editorialColors.muted,
                  letterSpacing: 0.8,
                }}
              >
                {selected ? 'X' : `0${option.score}`}
              </Text>
              <Text
                className="flex-1 font-prose-bold text-base leading-5"
                style={{ color: selected ? editorialColors.paper : editorialColors.ink }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        accessibilityLabel="Private rating note"
        multiline
        value={comment}
        onChangeText={setComment}
        placeholder="Add a private note"
        placeholderTextColor={editorialColors.muted}
        textAlignVertical="top"
        className="min-h-24 border-2 px-4 py-3 font-prose text-base leading-6"
        style={{ borderColor: editorialColors.ink, color: editorialColors.ink }}
      />
      <EditorialActionButton
        title={album.rating_id ? 'Update rating' : 'Save rating'}
        onPress={save}
        disabled={!score}
        loading={saveRating.isPending}
      />
    </View>
  );
}

function EditorialAlbumDetailView(props: Parameters<SkinComponentSet['AlbumDetailView']>[0]) {
  const date = formatIssueDate(props.album.pick_date);
  const markers = albumCoverMarkers(props.album);
  const showStandaloneKicker = props.isToday || !props.header;
  const bottomPadding = props.isToday
    ? getTabContentBottomPadding(props.bottomInset)
    : getPageBottomPadding(props.bottomInset);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      props.scrollY.value = event.contentOffset.y;
    },
  });
  const coverStyle = useAnimatedStyle(() => {
    if (props.reduceMotion) return {};
    const y = props.scrollY.value;
    return { transform: [{ scale: y < 0 ? 1 + -y / 900 : 1 }] };
  });

  return (
    <View className="flex-1" style={{ backgroundColor: editorialColors.paper }}>
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 top-0 z-10"
        style={{ height: props.topInset, backgroundColor: editorialColors.paper }}
      />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          props.onRefresh ? (
            <RefreshControl
              refreshing={!!props.refreshing}
              onRefresh={props.onRefresh}
              tintColor={editorialColors.ink}
              colors={[editorialColors.ink]}
              progressViewOffset={props.topInset}
            />
          ) : undefined
        }
        contentContainerStyle={{
          paddingTop: props.topInset + 12,
          paddingHorizontal: 20,
          paddingBottom: bottomPadding,
        }}
      >
        <View>
          {props.header && !props.isToday ? (
            <View className="flex-row items-center justify-between gap-4">
              {props.header}
              <Text
                className="shrink uppercase"
                style={[type.monoKicker, { color: editorialColors.muted }]}
                numberOfLines={1}
              >
                {`№${issueNo(props.album)} · ${date}`}
              </Text>
            </View>
          ) : (
            props.header
          )}

          <View>
            {showStandaloneKicker ? (
              <Text
                className="uppercase"
                style={[type.monoKicker, { color: editorialColors.muted }]}
              >
                {`№${issueNo(props.album)} · ${date}`}
              </Text>
            ) : null}
            {props.isToday ? (
              <Text
                className="mt-[7px] lowercase"
                style={[type.display34, { color: editorialColors.ink }]}
                maxFontSizeMultiplier={1.4}
              >
                your album of the{'\n'}
                <AccentText fallback className="lowercase" style={type.display34}>
                  day
                </AccentText>
              </Text>
            ) : null}
            <AccentRule thickness={3} style={{ marginTop: 12 }} />
          </View>

          <View style={{ marginTop: 22 }}>
            <Text
              className="uppercase"
              style={[type.display34, { color: editorialColors.ink, zIndex: 2 }]}
              numberOfLines={4}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.4}
            >
              {props.album.album_title}
            </Text>
            <View
              className="aspect-square w-full overflow-hidden"
              style={{ backgroundColor: editorialColors.paperAlt, marginTop: -8, zIndex: 1 }}
            >
              <Animated.View style={[{ flex: 1 }, coverStyle]}>
                {props.album.album_cover_url ? (
                  <CoverImage uri={props.album.album_cover_url} className="h-full w-full" />
                ) : (
                  <View className="h-full w-full items-center justify-center px-8">
                    <BrandMark size={84} muted />
                    <Text
                      className="mt-5 text-center font-display text-3xl uppercase"
                      style={{ color: editorialColors.muted }}
                    >
                      Cover unavailable
                    </Text>
                  </View>
                )}
              </Animated.View>
              {markers.length > 0 ? (
                <View className="absolute bottom-2 right-2 flex-row gap-2">
                  {markers.map((marker) => (
                    <EditorialMarker key={marker} label={marker} />
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <EditorialSpecLine items={albumSpec(props.album)} />
          </View>

          <View style={{ marginTop: 18 }}>
            <EditorialWhyRule />
            <Text className="mt-3" style={[type.proseReason, { color: editorialColors.ink }]}>
              {formatSelectionReason(props.album.selection_reason)}
            </Text>
          </View>

          <View style={{ marginTop: 22 }}>
            <EditorialAlbumActions
              opening={props.opening}
              sharing={props.sharing}
              onOpen={props.onOpen}
              onShare={props.onShare}
            />
          </View>

          {props.isFreeSpotify ? (
            <View
              className="mt-6 border-2 px-3 py-2"
              style={{
                borderColor: editorialColors.ink,
                backgroundColor: editorialColors.paperAlt,
              }}
            >
              <Text
                className="mb-1 font-mono-bold text-[10px] uppercase leading-4"
                style={{ color: editorialColors.muted, letterSpacing: 0.9 }}
              >
                Spotify Free
              </Text>
              <Text
                className="font-prose-medium text-sm leading-5"
                style={{ color: editorialColors.ink }}
              >
                Free Spotify may shuffle this album. Premium plays it in order.
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: props.isFreeSpotify ? 20 : 26 }}>
            <EditorialRatingEditor album={props.album} />
          </View>
          {props.footer ? <View style={{ marginTop: 22 }}>{props.footer}</View> : null}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

function ListSkeleton() {
  return (
    <View className="mt-5">
      {skeletonRows.map((row, index) => (
        <View
          key={row}
          className="min-h-[98px] flex-row gap-3 py-3"
          style={{
            borderColor: editorialColors.ink,
            borderTopWidth: index === 0 ? 2 : 1,
            borderBottomWidth: index === skeletonRows.length - 1 ? 2 : 0,
          }}
        >
          <View className="w-11 pt-1">
            <Skeleton className="h-3 w-8 rounded-none" />
            <Skeleton className="mt-2 h-4 w-9 rounded-none" />
          </View>
          <Skeleton className="h-[72px] w-[72px] rounded-none" />
          <View className="flex-1 justify-center gap-2">
            <Skeleton className="h-5 w-3/4 rounded-none" />
            <Skeleton className="h-3 w-2/3 rounded-none" />
            <Skeleton className="h-6 w-20 rounded-none" />
          </View>
        </View>
      ))}
    </View>
  );
}

function EditorialDiscoveriesView(props: Parameters<SkinComponentSet['DiscoveriesView']>[0]) {
  const insets = useSafeAreaInsets();
  const bottomPadding = getTabContentBottomPadding(insets.bottom);

  return (
    <View className="flex-1" style={{ backgroundColor: editorialColors.paper }}>
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 top-0 z-10"
        style={{ height: insets.top, backgroundColor: editorialColors.paper }}
      />
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 12 }}>
        <View>
          <Text
            className="uppercase"
            style={[type.archiveMasthead, { color: editorialColors.ink }]}
            maxFontSizeMultiplier={1.3}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            Archive
          </Text>
          <View className="mt-[2px] flex-row items-end justify-between gap-4">
            <Text
              className="uppercase"
              style={[type.archiveContents, { color: editorialColors.ink }]}
            >
              Contents
            </Text>
            <Text
              className="shrink text-right uppercase"
              style={[type.monoKicker, { color: editorialColors.muted }]}
              numberOfLines={1}
            >
              {`${props.discoveries.length} issues`}
            </Text>
          </View>
          <AccentRule thickness={3} style={{ marginTop: 10 }} />
        </View>

        <View
          className="mt-5 flex-row border-2"
          accessibilityRole="tablist"
          style={{ borderColor: editorialColors.ink }}
        >
          {(Object.keys(filterLabels) as DiscoveryFilter[]).map((filter, index) => {
            const selected = props.filter === filter;
            return (
              <Pressable
                key={filter}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => props.onFilterChange(filter)}
                className="min-h-11 flex-1 items-center justify-center px-2 active:opacity-80"
                style={{
                  backgroundColor: selected ? editorialColors.ink : 'transparent',
                  borderLeftWidth: index === 0 ? 0 : 1,
                  borderLeftColor: editorialColors.ink,
                }}
              >
                <Text
                  className="uppercase"
                  style={[
                    type.monoLabel,
                    { color: selected ? editorialColors.paper : editorialColors.ink },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {filterLabels[filter]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {props.loading ? (
          <ListSkeleton />
        ) : props.error ? (
          <View className="mt-6 flex-1">
            {editorialSkin.States.ErrorState({
              title: 'Missing issue.',
              retrying: props.retrying,
              onRetry: props.onRetry,
            })}
          </View>
        ) : (
          <Animated.FlatList
            className="mt-5 flex-1"
            contentContainerStyle={
              props.filtered.length
                ? { paddingBottom: bottomPadding }
                : { flex: 1, paddingBottom: bottomPadding }
            }
            refreshControl={
              <RefreshControl
                refreshing={props.retrying}
                onRefresh={props.onRetry}
                tintColor={editorialColors.ink}
                colors={[editorialColors.ink]}
              />
            }
            data={props.filtered}
            keyExtractor={(item) => item.aotd_id}
            renderItem={({ item, index }) => (
              <EditorialDiscoveryRow
                album={item}
                index={index}
                isFirst={index === 0}
                isLast={index === props.filtered.length - 1}
                onPress={() => props.onOpenDiscovery(item)}
              />
            )}
            ListEmptyComponent={() => (
              <EditorialArchiveEmptyState title={props.emptyTitle} subtitle={props.emptySubtitle} />
            )}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            removeClippedSubviews
            showsVerticalScrollIndicator={false}
            windowSize={7}
          />
        )}
      </View>
    </View>
  );
}

function EditorialArchiveEmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="flex-1 justify-center">
      <View className="border-2 px-4 py-5" style={{ borderColor: editorialColors.ink }}>
        <View className="flex-row items-center gap-3">
          <Text className="uppercase" style={[type.monoLabel, { color: editorialColors.muted }]}>
            No. 000
          </Text>
          <View className="h-[2px] flex-1" style={{ backgroundColor: editorialColors.ink }} />
        </View>
        <AccentRule />
        <Text
          className="mt-5 uppercase"
          style={[type.archiveTitle, { color: editorialColors.ink, fontSize: 28, lineHeight: 28 }]}
        >
          Blank archive page
        </Text>
        <Text className="mt-3" style={[type.proseSmall, { color: editorialColors.muted }]}>
          {title}
          {subtitle ? ` ${subtitle}` : ''}
        </Text>
      </View>
    </View>
  );
}

function archiveStatus(album: AlbumDiscovery): {
  visualLabel: string;
  accessibilityLabel: string;
  tone: 'ink' | 'paper' | 'red';
  style?: ViewStyle;
} {
  const accessibilityLabel = getDiscoveryStatusLabel(album);

  if (album.rating_score) {
    return {
      visualLabel: `Rated 0${album.rating_score}`,
      accessibilityLabel,
      tone: 'ink',
      style: { borderColor: ratingTone[album.rating_score] },
    };
  }

  if (album.status === 'rated') {
    return {
      visualLabel: 'Rated',
      accessibilityLabel,
      tone: 'ink',
    };
  }

  if (album.status === 'opened') {
    return {
      visualLabel: 'Opened',
      accessibilityLabel,
      tone: 'red',
    };
  }

  return {
    visualLabel: 'Waiting',
    accessibilityLabel,
    tone: 'paper',
  };
}

function EditorialDiscoveryRow({
  album,
  index,
  isFirst,
  isLast,
  onPress,
}: {
  album: AlbumDiscovery;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const [shouldAnimate] = React.useState(() => {
    if (reduceMotion || seenDiscoveryRows.has(album.aotd_id)) return false;
    seenDiscoveryRows.add(album.aotd_id);
    return true;
  });
  const date = new Date(`${album.pick_date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const status = archiveStatus(album);
  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${album.album_title} by ${album.album_primary_artist_name}, ${date}, ${status.accessibilityLabel}`}
      onPress={onPress}
      className="min-h-[100px] flex-row gap-3 py-3 active:opacity-80"
      style={{
        borderColor: editorialColors.ink,
        borderTopWidth: isFirst ? 2 : 1,
        borderBottomWidth: isLast ? 2 : 0,
      }}
    >
      <View className="w-11 pt-1">
        <Text className="uppercase" style={[type.archiveIssue, { color: editorialColors.muted }]}>
          No.
        </Text>
        <Text className="uppercase" style={[type.archiveIssue, { color: editorialColors.ink }]}>
          {String(issueNo(album)).padStart(3, '0')}
        </Text>
      </View>
      <View
        className="h-[72px] w-[72px] border-2"
        style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.paperAlt }}
      >
        {album.album_cover_url ? (
          <CoverImage uri={album.album_cover_url} className="h-full w-full" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <BrandMark size={28} muted />
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1 justify-center">
        <Text
          className="uppercase"
          style={[type.archiveTitle, { color: editorialColors.ink }]}
          numberOfLines={2}
        >
          {album.album_title}
        </Text>
        <Text
          className="mt-[5px] uppercase"
          style={[type.archiveMeta, { color: editorialColors.muted }]}
          numberOfLines={1}
        >
          {album.album_primary_artist_name} / {date}
        </Text>
        <View className="mt-[9px] self-start">
          <EditorialMarker label={status.visualLabel} tone={status.tone} style={status.style} />
        </View>
      </View>
    </Pressable>
  );

  if (!shouldAnimate) return content;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 180, delay: Math.min(index, 8) * 25 }}
    >
      {content}
    </MotiView>
  );
}

function LedgerStat({
  value,
  label,
  loading,
}: {
  value: string;
  label: string;
  loading?: boolean;
}) {
  return (
    <View className="flex-1 border-t-2 pt-3" style={{ borderColor: editorialColors.ink }}>
      {loading ? (
        <Skeleton className="h-[42px] w-4/5 rounded-none" />
      ) : (
        <Text
          className="font-display text-[42px] uppercase leading-[42px]"
          style={{ color: editorialColors.ink, letterSpacing: 0 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {value}
        </Text>
      )}
      <Text
        className="mt-1 font-mono text-[10px] uppercase leading-4"
        style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
      >
        {label}
      </Text>
    </View>
  );
}

function listeningMoodLabel(avgScore: number | null | undefined) {
  if (avgScore == null) return 'No mood yet';
  if (avgScore >= 4.5) return 'Loved it';
  if (avgScore >= 3.5) return 'Liked it';
  if (avgScore >= 2.5) return 'It was alright';
  if (avgScore >= 1.5) return 'Not for me';
  return 'Bad';
}

function LibrarySpanLine({ min, max }: { min: number | null; max: number | null }) {
  if (min == null || max == null) return null;

  return (
    <Text
      className="font-mono text-[11px] uppercase leading-5"
      style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
    >
      {copy.profile.librarySpan(min, max)}
    </Text>
  );
}

function EditorialArchiveLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.impactLight();
        onPress();
      }}
      className="min-h-12 flex-row items-center justify-between border-2 px-3 py-3 active:opacity-70"
      style={{ borderColor: editorialColors.ink }}
    >
      <Text
        className="font-mono-bold text-xs uppercase leading-4"
        style={{ color: editorialColors.ink, letterSpacing: 0.8 }}
      >
        Open rated archive
      </Text>
      <Ionicons name="arrow-forward" size={18} color={editorialColors.ink} />
    </Pressable>
  );
}

function EditorialProfileView(props: Parameters<SkinComponentSet['ProfileView']>[0]) {
  const insets = useSafeAreaInsets();
  const bottomPadding = getTabContentBottomPadding(insets.bottom, 32);
  const streak = props.overview?.streak ?? 0;
  const discovered = props.overview?.total_discovered ?? 0;
  const rated = props.overview?.listening.total_rated ?? 0;
  const artists = props.overview?.taste.top_artists ?? [];
  const decades = props.overview?.taste.decades ?? [];
  const maxDecade = decades.reduce((max, item) => Math.max(max, item.count), 0);
  const heroSubtitle = props.overviewLoading
    ? 'Reading your private listening record'
    : props.heroSubtitle;
  const listening = props.overview?.listening;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: Math.max(16, insets.top + 8),
        paddingBottom: bottomPadding,
        gap: 24,
      }}
      style={{ backgroundColor: editorialColors.paper }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={props.refreshing}
          onRefresh={props.onRefresh}
          tintColor={editorialColors.ink}
          colors={[editorialColors.ink]}
          progressViewOffset={insets.top}
        />
      }
    >
      <View className="gap-3">
        <Text
          className="font-display text-[54px] uppercase leading-[52px]"
          style={{ color: editorialColors.ink, letterSpacing: 0 }}
          maxFontSizeMultiplier={1.3}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          Colophon
        </Text>
        <AccentRule />
        <Text
          className="font-mono text-[11px] uppercase leading-4"
          style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
        >
          LISTENING LEDGER / PRIVATE EDITION
        </Text>
      </View>

      <View className="border-y-2 py-4" style={{ borderColor: editorialColors.ink }}>
        <View className="flex-row gap-4">
          <View className="pt-1">
            {props.profileLoading ? (
              <Skeleton className="h-[84px] w-[84px] rounded-none" />
            ) : (
              <Avatar
                label={props.profile?.display_name}
                size={84}
                uri={props.profile?.avatar_url}
                rounded={false}
              />
            )}
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className="font-mono-bold text-[10px] uppercase leading-4"
              style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
            >
              PRIVATE LISTENING IDENTITY
            </Text>
            {props.profileLoading ? (
              <View className="mt-2 gap-2">
                <Skeleton className="h-8 w-full rounded-none" />
                <Skeleton className="h-5 w-4/5 rounded-none" />
              </View>
            ) : (
              <>
                <Text
                  className="mt-1 font-display text-3xl leading-8"
                  style={{ color: editorialColors.ink, letterSpacing: 0 }}
                  numberOfLines={3}
                  maxFontSizeMultiplier={1.4}
                >
                  {props.profile?.display_name ?? 'Spotify listener'}
                </Text>
                <Text
                  className="mt-2 font-prose text-sm leading-5"
                  style={{ color: editorialColors.muted }}
                >
                  {heroSubtitle}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      <View className="flex-row gap-3">
        <LedgerStat value={String(streak)} label="day streak" loading={props.overviewLoading} />
        <LedgerStat value={String(discovered)} label="issues" loading={props.overviewLoading} />
        <LedgerStat value={String(rated)} label="rated" loading={props.overviewLoading} />
      </View>

      <View className="gap-4">
        <EditorialSectionRule title="Taste map" aside="source material" major />
        {props.overviewLoading ? (
          <View className="gap-3">
            <Skeleton className="h-16 w-full rounded-none" />
            <Skeleton className="h-16 w-full rounded-none" />
            <Skeleton className="h-24 w-full rounded-none" />
          </View>
        ) : props.overview && (artists.length > 0 || decades.length > 0) ? (
          <View className="gap-5">
            <LibrarySpanLine
              min={props.overview.taste.span_min}
              max={props.overview.taste.span_max}
            />
            {artists.length > 0 ? (
              <View className="gap-3">
                {artists.slice(0, 6).map((artist, index) => (
                  <View
                    key={artist.name}
                    className="border-2 px-3 py-3"
                    style={{ borderColor: editorialColors.ink }}
                  >
                    <View className="flex-row items-start gap-3">
                      <Text
                        className="w-9 font-mono-bold text-[11px] uppercase leading-5"
                        style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </Text>
                      <Text
                        className="min-w-0 flex-1 font-prose-bold text-lg leading-6"
                        style={{ color: editorialColors.ink }}
                        numberOfLines={2}
                      >
                        {artist.name}
                      </Text>
                      <View className="min-w-[54px] items-end">
                        <Text
                          className="font-mono-bold text-[11px] uppercase leading-5"
                          style={{ color: editorialColors.ink, letterSpacing: 0.8 }}
                        >
                          {artist.count}
                        </Text>
                        <Text
                          className="font-mono text-[10px] uppercase leading-4"
                          style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
                        >
                          saves
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            {decades.length > 0 ? (
              <View className="gap-3">
                {decades.map((decade) => (
                  <View key={decade.decade} className="gap-2">
                    <View className="flex-row items-end justify-between gap-3">
                      <Text
                        className="font-mono-bold text-[11px] uppercase"
                        style={{ color: editorialColors.ink, letterSpacing: 0.8 }}
                      >
                        {decade.decade}s
                      </Text>
                      <Text
                        className="font-mono text-[11px] uppercase"
                        style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
                      >
                        {decade.count} albums
                      </Text>
                    </View>
                    <View
                      className="h-5 border-2 p-[2px]"
                      style={{ borderColor: editorialColors.ink }}
                    >
                      <View
                        className="h-full"
                        style={{
                          width: `${maxDecade ? Math.max(4, (decade.count / maxDecade) * 100) : 0}%`,
                          backgroundColor: editorialColors.ink,
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <Text className="font-prose text-sm leading-5" style={{ color: editorialColors.muted }}>
            As soon as your library finishes importing, your top artists and eras show up here.
          </Text>
        )}
      </View>

      <View className="gap-4">
        <EditorialSectionRule title="Listening" aside="private journal" major />
        {props.overviewLoading ? (
          <View className="gap-3">
            <Skeleton className="h-16 w-full rounded-none" />
            <Skeleton className="h-12 w-full rounded-none" />
          </View>
        ) : listening?.total_rated ? (
          <View className="gap-3">
            <View className="border-2 p-3" style={{ borderColor: editorialColors.ink }}>
              <Text
                className="font-mono-bold text-[11px] uppercase leading-4"
                style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
              >
                Current journal mood
              </Text>
              <Text
                className="mt-2 font-display text-3xl uppercase leading-8"
                style={{ color: editorialColors.ink, letterSpacing: 0 }}
              >
                {listeningMoodLabel(listening.avg_score)}
              </Text>
            </View>
            <View className="flex-row gap-3">
              <LedgerStat value={String(listening.rated_this_month)} label="rated this month" />
              <LedgerStat value={String(listening.loved_count)} label="loved" />
            </View>
            <EditorialArchiveLink onPress={props.onOpenRatedDiscoveries} />
          </View>
        ) : (
          <Text className="font-prose text-sm leading-5" style={{ color: editorialColors.muted }}>
            Rate a discovery and this becomes your private listening ledger.
          </Text>
        )}
      </View>

      <View className="gap-4 pt-2">
        <EditorialSectionRule title="Production notes" aside="library" major />
        <Text
          className="font-mono text-[11px] uppercase leading-5"
          style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
        >
          {props.libraryStatsLoading
            ? 'Loading...'
            : props.libraryStats?.albumsTracked == null
              ? 'Not synced yet'
              : `${props.libraryStats.albumsTracked} albums tracked`}
          {props.libraryStats?.lastSyncedAt
            ? ` / synced ${relativeTime(props.libraryStats.lastSyncedAt)}`
            : ''}
        </Text>
        <EditorialSyncBanner status={props.syncStatus} />
        <EditorialActionButton
          disabled={props.isSyncing}
          loading={props.isSyncing}
          onPress={props.onSyncNow}
          title={props.isSyncing ? 'Syncing...' : 'Sync library now'}
          tone="paper"
        />
      </View>

      <View className="gap-4">
        <EditorialSectionRule title="Connections" aside="spotify" major />
        <Text className="font-prose text-base leading-6" style={{ color: editorialColors.ink }}>
          {props.connection
            ? `Spotify connected${props.profile?.display_name ? ` as ${props.profile.display_name}` : ''}`
            : 'No Spotify connection yet'}
        </Text>
        {props.connection?.connected_at ? (
          <Text
            className="font-mono text-[11px] uppercase leading-4"
            style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
          >
            Connected {relativeTime(props.connection.connected_at)}
          </Text>
        ) : null}
        {props.product ? (
          <View className="self-start">
            <EditorialMarker label={`Spotify ${props.product}`} tone="paper" />
          </View>
        ) : null}
      </View>

      <View className="mt-3 border-t-2 pt-6" style={{ borderColor: editorialColors.ink }}>
        <EditorialActionButton title="Log out" tone="red" onPress={props.onSignOut} />
      </View>
    </ScrollView>
  );
}

function EditorialSignInView({ loading, onSignIn }: Parameters<SkinComponentSet['SignInView']>[0]) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 justify-between px-5"
      style={{
        backgroundColor: editorialColors.paper,
        paddingTop: insets.top + 28,
        paddingBottom: insets.bottom + 28,
      }}
    >
      <View className="gap-4">
        <Text
          className="font-display text-[62px] uppercase leading-[60px]"
          style={{ color: editorialColors.ink, letterSpacing: 0 }}
        >
          Album of the Day
        </Text>
        <AccentRule />
        <Text className="font-prose text-base leading-6" style={{ color: editorialColors.ink }}>
          One record a day, chosen from the edges of your Spotify taste.
        </Text>
        <Text
          className="font-mono text-[11px] uppercase leading-4"
          style={{ color: editorialColors.muted, letterSpacing: 0.8 }}
        >
          ( private journal / no genre math / no skips )
        </Text>
      </View>
      <View className="gap-4 border-2 p-4" style={{ borderColor: editorialColors.ink }}>
        <SpotifyButton disabled={loading} loading={loading} onPress={onSignIn} />
        <Text
          className="text-center font-prose text-sm leading-5"
          style={{ color: editorialColors.muted }}
        >
          We use your saved music to avoid the obvious. Tokens stay server-side and ratings stay
          private.
        </Text>
      </View>
    </View>
  );
}

function EditorialInitialSyncingView(props: Parameters<SkinComponentSet['InitialSyncingView']>[0]) {
  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ backgroundColor: editorialColors.paper }}
    >
      <View className="mb-8 border-2 p-6" style={{ borderColor: editorialColors.ink }}>
        <BrandMark size={72} muted />
      </View>
      <Text
        className="text-center font-display text-4xl uppercase leading-10"
        style={{ color: editorialColors.ink }}
      >
        {props.isFailed || props.isStale
          ? props.isStale
            ? 'Sync is slow'
            : "Couldn't read library"
          : 'Building your music profile'}
      </Text>
      <Text
        className="mt-3 mb-8 text-center font-prose text-sm leading-5"
        style={{ color: editorialColors.muted }}
      >
        {props.isFailed || props.isStale
          ? props.isStale
            ? 'You can safely restart the library import.'
            : 'Library sync could not finish. Tap below to retry.'
          : props.isStarting
            ? 'Connecting to Spotify...'
            : `Importing ${props.processed} of ${props.total || '?'}`}
      </Text>
      {!props.isStarting && props.total > 0 && !props.isFailed && !props.isStale ? (
        <View className="w-full max-w-xs">
          <ProgressBar
            ratio={props.ratio}
            height={8}
            bordered
            trackColor={editorialColors.paper}
            fillColor={editorialColors.accentStatic}
            borderColor={editorialColors.ink}
          />
        </View>
      ) : props.isFailed || props.isStale || props.showStartRetry ? (
        <EditorialActionButton
          title={props.retrying ? 'Retrying...' : 'Try again'}
          disabled={props.retrying}
          onPress={props.onRetry}
        />
      ) : (
        <ActivityIndicator color={editorialColors.accentStatic} />
      )}
    </View>
  );
}

function EditorialShareCard({ album }: { album: AlbumDiscovery }) {
  return (
    <View
      className="h-[1200px] w-[900px] justify-between p-14"
      style={{ backgroundColor: editorialColors.paper }}
    >
      <View className="gap-7">
        <View>
          <Text
            className="font-display text-[74px] uppercase leading-[72px]"
            style={{ color: editorialColors.ink }}
          >
            Album of{'\n'}the Day
          </Text>
          <View className="mt-5 h-2" style={{ backgroundColor: editorialColors.accentStatic }} />
          <Text
            className="mt-4 font-mono-bold text-2xl uppercase"
            style={{ color: editorialColors.muted, letterSpacing: 1.2 }}
          >
            No. {issueNo(album)} / {formatIssueDate(album.pick_date)}
          </Text>
        </View>
        <View
          className="h-[640px] w-[640px] border-4 p-3"
          style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.paperAlt }}
        >
          {album.album_cover_url ? (
            <Image
              source={{ uri: album.album_cover_url }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <BrandMark size={108} muted />
              <Text
                className="mt-8 font-mono-bold text-2xl uppercase"
                style={{ color: editorialColors.muted, letterSpacing: 1.2 }}
              >
                Artwork unavailable
              </Text>
            </View>
          )}
        </View>
        <View>
          <Text
            numberOfLines={4}
            className="font-display text-[64px] leading-[64px]"
            style={{ color: editorialColors.ink }}
          >
            {album.album_title}
          </Text>
          <Text
            numberOfLines={2}
            className="mt-4 font-prose-bold text-4xl leading-[42px]"
            style={{ color: editorialColors.ink }}
          >
            {album.album_primary_artist_name}
          </Text>
        </View>
      </View>
      <Text
        numberOfLines={1}
        className="font-mono text-2xl"
        style={{ color: editorialColors.muted }}
      >
        {spotifyAlbumUrl(album.album_spotify_id)}
      </Text>
    </View>
  );
}

function EditorialEmptyState({
  title,
  subtitle,
  actionTitle,
  onAction,
}: Parameters<SkinComponentSet['States']['EmptyState']>[0]) {
  return (
    <View className="flex-1 justify-center gap-4 py-12">
      <EditorialSectionRule title="Blank page" major />
      <Text
        className="font-display text-3xl uppercase leading-8"
        style={{ color: editorialColors.ink }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text className="font-prose text-base leading-6" style={{ color: editorialColors.muted }}>
          {subtitle}
        </Text>
      ) : null}
      {actionTitle && onAction ? (
        <EditorialActionButton title={actionTitle} onPress={onAction} />
      ) : null}
    </View>
  );
}

function EditorialErrorState({
  title,
  retrying,
  onRetry,
  secondaryTitle,
  onSecondary,
}: Parameters<SkinComponentSet['States']['ErrorState']>[0]) {
  return (
    <View className="flex-1 justify-center gap-4 py-12">
      <EditorialSectionRule title="Retry stamp" aside="network" major />
      <Text
        className="font-display text-3xl uppercase leading-8"
        style={{ color: editorialColors.ink }}
      >
        {title}
      </Text>
      <Text className="font-prose text-base leading-6" style={{ color: editorialColors.muted }}>
        The issue may exist, but the press room could not fetch it just now.
      </Text>
      {onRetry ? (
        <EditorialActionButton
          title={retrying ? 'Retrying...' : 'Try again'}
          loading={retrying}
          onPress={onRetry}
        />
      ) : null}
      {secondaryTitle && onSecondary ? (
        <EditorialActionButton title={secondaryTitle} tone="red" onPress={onSecondary} />
      ) : null}
    </View>
  );
}

export const editorialSkin: SkinComponentSet = {
  chrome: {
    id: 'editorial',
    rootBackground: editorialColors.paper,
    surface: editorialColors.paper,
    surfaceAlt: editorialColors.paperAlt,
    text: editorialColors.ink,
    muted: editorialColors.muted,
    accent: editorialColors.accentStatic,
    primary: editorialColors.primary,
    onPrimary: editorialColors.onPrimary,
    statusBarStyle: 'dark',
    tabBar: {
      backgroundColor: editorialColors.paper,
      borderTopColor: editorialColors.ink,
      borderTopWidth: 2,
      activeTintColor: editorialColors.ink,
      inactiveTintColor: editorialColors.muted,
      activeIndicatorColor: editorialColors.accentStatic,
      labelFontFamily: 'Archivo_600SemiBold',
      labelFontSize: 12,
      iconSize: 26,
    },
  },
  AlbumDetailView: EditorialAlbumDetailView,
  DiscoveriesView: EditorialDiscoveriesView,
  ProfileView: EditorialProfileView,
  SignInView: EditorialSignInView,
  InitialSyncingView: EditorialInitialSyncingView,
  ShareCard: EditorialShareCard,
  SyncBanner: EditorialSyncBanner,
  States: {
    AlbumDetailSkeleton: () => (
      <View className="gap-4" style={{ backgroundColor: editorialColors.paper }}>
        <Skeleton className="aspect-square w-full rounded-none" />
        <Skeleton className="h-14 w-4/5 rounded-none" />
        <Skeleton className="h-4 w-full rounded-none" />
        <Skeleton className="h-4 w-2/3 rounded-none" />
      </View>
    ),
    PickError: ({ onRetry, retrying }) => (
      <EditorialErrorState
        title="Could not check today's pick."
        retrying={retrying}
        onRetry={onRetry}
      />
    ),
    WaitingForPick: (props) => {
      const isFirstReady =
        props?.syncCompleted && props?.isFirstPick && (props?.libraryAlbumCount ?? 0) >= 5;
      return (
        <EditorialEmptyState
          title={isFirstReady ? 'Building your first pick' : 'Your pick is brewing'}
          subtitle={
            isFirstReady
              ? 'We imported your Spotify library. Now we are narrowing the first album.'
              : 'Should be ready by your usual push time. Check back soon.'
          }
        />
      );
    },
    EmptyState: EditorialEmptyState,
    ErrorState: EditorialErrorState,
  },
};

function syncFailureCopy(status: LibrarySyncStatus) {
  if (status.error_code === 'spotify_rate_limited') {
    return 'Spotify asked us to slow down. Try syncing again in a little while.';
  }

  return 'Library sync could not finish. Try syncing again.';
}

function EditorialSyncBanner({
  status: statusOverride,
}: Parameters<SkinComponentSet['SyncBanner']>[0] = {}) {
  if (statusOverride !== undefined) {
    return <EditorialSyncBannerContent status={statusOverride} />;
  }

  return <EditorialLiveSyncBanner />;
}

function EditorialLiveSyncBanner() {
  const { status } = useLibrarySyncStatus();

  return <EditorialSyncBannerContent status={status} />;
}

function EditorialSyncBannerContent({ status }: { status: LibrarySyncStatus | null }) {
  if (!status || status.status === 'idle' || status.status === 'completed') return null;
  const isStale = isStaleLibrarySync(status);

  if (status.status === 'failed' || isStale) {
    return (
      <View className="border-2 px-4 py-3" style={{ borderColor: editorialColors.red }}>
        <Text className="font-prose text-sm leading-5" style={{ color: editorialColors.ink }}>
          {isStale
            ? 'Sync is taking longer than expected. You can try again now.'
            : syncFailureCopy(status)}
        </Text>
      </View>
    );
  }

  const total = status.total_estimate ?? 0;
  const processed = status.processed_count ?? 0;
  const ratio = total > 0 ? processed / total : 0;

  return (
    <View
      className="border-2 px-4 py-3"
      style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.paperAlt }}
    >
      <Text
        className="mb-2 font-mono text-[11px] uppercase leading-4"
        style={{ color: editorialColors.ink, letterSpacing: 0.8 }}
      >
        Importing your library... {processed} / {total || '?'}
      </Text>
      <ProgressBar
        ratio={ratio}
        height={8}
        bordered
        trackColor={editorialColors.paper}
        fillColor={editorialColors.accentStatic}
        borderColor={editorialColors.ink}
      />
    </View>
  );
}
