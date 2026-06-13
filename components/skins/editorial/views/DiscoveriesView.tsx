import { MotiView } from 'moti';
import * as React from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DiscoveryFilter } from '@/components/album/StatusTabs';
import { BrandMark } from '@/components/brand/BrandMark';
import { AccentRule } from '@/components/skins/editorial/accent/AccentRule';
import { EditorialMasthead } from '@/components/skins/editorial/EditorialMasthead';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import {
  editorialColors,
  editorialType,
  ratingTone,
  tracking,
} from '@/components/skins/shared/skinStyles';
import { CoverImage } from '@/components/ui/CoverImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useReduceMotion } from '@/lib/hooks/useReduceMotion';
import { getTabContentBottomPadding } from '@/lib/navigationChrome';
import {
  type AlbumDiscovery,
  getDiscoveryStatusLabel,
  type RatingScore,
} from '@/lib/recommendation';
import type { SkinComponentSet } from '@/theme/skins/types';
import { type ArchiveListItem, buildArchiveItems, filterLabels, issueNo } from '../lib';
import { EditorialErrorState } from './states';

const skeletonRows = ['one', 'two', 'three', 'four', 'five', 'six'];
const seenDiscoveryRows = new Set<string>();
const type = editorialType;

function ListSkeleton() {
  return (
    <View className="mt-5">
      {skeletonRows.map((row, index) => (
        <View
          key={row}
          className="min-h-[76px] flex-row items-center gap-3 py-3"
          style={{
            borderColor: editorialColors.ink,
            borderTopWidth: index === 0 ? 2 : 1,
            borderBottomWidth: index === skeletonRows.length - 1 ? 2 : 0,
          }}
        >
          <Skeleton className="h-10 w-10 rounded-none" />
          <View className="flex-1 justify-center gap-2">
            <Skeleton className="h-5 w-3/4 rounded-none" />
            <Skeleton className="h-3 w-2/3 rounded-none" />
          </View>
          <Skeleton className="h-8 w-14 rounded-none" />
        </View>
      ))}
    </View>
  );
}

function EditorialArchiveMonthHeader({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 pb-2 pt-5">
      <Text
        className="font-mono-bold text-[11px] uppercase leading-4"
        style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
      >
        {label}
      </Text>
      <View className="h-[2px] flex-1" style={{ backgroundColor: editorialColors.ink }} />
    </View>
  );
}

function ArchiveFilterTab({
  label,
  selected,
  isFirst,
  onPress,
}: {
  label: string;
  selected: boolean;
  isFirst: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = React.useState(false);
  const inverted = selected || pressed;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      className="min-h-11 flex-1 items-center justify-center px-2"
      style={{
        backgroundColor: inverted ? editorialColors.ink : 'transparent',
        borderLeftWidth: isFirst ? 0 : 1,
        borderLeftColor: editorialColors.ink,
      }}
    >
      <Text
        className="uppercase"
        style={[type.monoLabel, { color: inverted ? editorialColors.paper : editorialColors.ink }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function EditorialDiscoveriesView(
  props: Parameters<SkinComponentSet['DiscoveriesView']>[0],
) {
  const insets = useSafeAreaInsets();
  const bottomPadding = getTabContentBottomPadding(insets.bottom);
  const items = React.useMemo(() => buildArchiveItems(props.filtered), [props.filtered]);

  return (
    <View className="flex-1" style={{ backgroundColor: editorialColors.paper }}>
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 top-0 z-10"
        style={{ height: insets.top, backgroundColor: editorialColors.paper }}
      />
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 12 }}>
        <View>
          <EditorialMasthead issueLabel={`${props.discoveries.length} issues`} />
          <Text
            className="mt-3 uppercase"
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
          <View className="mt-3 flex-row items-center gap-3">
            <Text
              className="font-mono-bold text-[10px] uppercase leading-4"
              style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
            >
              Daily records
            </Text>
            <View className="h-px flex-1" style={{ backgroundColor: editorialColors.ink }} />
            <Text
              className="font-mono text-[10px] uppercase leading-4"
              style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
            >
              all / waiting / rated
            </Text>
          </View>
          <AccentRule thickness={3} style={{ marginTop: 10 }} />
        </View>

        <View
          className="mt-5 flex-row border-2"
          accessibilityRole="tablist"
          style={{ borderColor: editorialColors.ink }}
        >
          {(Object.keys(filterLabels) as DiscoveryFilter[]).map((filter, index) => (
            <ArchiveFilterTab
              key={filter}
              label={filterLabels[filter]}
              selected={props.filter === filter}
              isFirst={index === 0}
              onPress={() => props.onFilterChange(filter)}
            />
          ))}
        </View>

        {props.loading ? (
          <ListSkeleton />
        ) : props.error ? (
          <View className="mt-6 flex-1">
            <EditorialErrorState
              title="Missing issue."
              retrying={props.retrying}
              onRetry={props.onRetry}
            />
          </View>
        ) : (
          <Animated.FlatList<ArchiveListItem>
            className="mt-1 flex-1"
            contentContainerStyle={
              items.length
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
            data={items}
            keyExtractor={(item) => item.key}
            renderItem={({ item, index }: { item: ArchiveListItem; index: number }) =>
              item.kind === 'header' ? (
                <EditorialArchiveMonthHeader label={item.label} />
              ) : (
                <EditorialDiscoveryRow
                  album={item.album}
                  index={index}
                  firstInGroup={item.firstInGroup}
                  isLast={item.isLast}
                  onPress={() => props.onOpenDiscovery(item.album)}
                />
              )
            }
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
      <PaperGrain />
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
  accessibilityLabel: string;
  ratingScore: RatingScore | null;
} {
  const accessibilityLabel = getDiscoveryStatusLabel(album);

  if (album.rating_score) {
    return {
      accessibilityLabel,
      ratingScore: album.rating_score,
    };
  }

  return {
    accessibilityLabel,
    ratingScore: null,
  };
}

function ArchiveRowMark({ ratingScore }: { ratingScore: RatingScore | null }) {
  if (ratingScore) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="min-w-12 items-center border-2 px-2 py-1"
        style={{ borderColor: editorialColors.accentStatic }}
      >
        <Text
          className="font-mono-bold text-[11px] uppercase leading-4"
          style={{ color: ratingTone[ratingScore], letterSpacing: tracking.label }}
        >
          {`0${ratingScore}`}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="min-w-16 items-center border px-2 py-1"
      style={{ borderColor: editorialColors.ink }}
    >
      <Text
        className="font-mono-bold text-[10px] uppercase leading-4"
        style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
      >
        Waiting
      </Text>
    </View>
  );
}

function EditorialDiscoveryRow({
  album,
  index,
  firstInGroup,
  isLast,
  onPress,
}: {
  album: AlbumDiscovery;
  index: number;
  firstInGroup: boolean;
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
      className="min-h-[76px] flex-row items-center gap-3 py-3 active:opacity-80"
      style={{
        borderColor: editorialColors.ink,
        borderTopWidth: firstInGroup ? 0 : 1,
        borderBottomWidth: isLast ? 2 : 0,
      }}
    >
      <View
        className="h-10 w-10 overflow-hidden border"
        style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.paperAlt }}
      >
        {album.album_cover_url ? (
          <CoverImage uri={album.album_cover_url} className="h-full w-full" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <BrandMark size={20} muted />
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1 justify-center">
        <Text className="uppercase" style={[type.archiveIssue, { color: editorialColors.muted }]}>
          {`No. ${String(issueNo(album)).padStart(3, '0')}`}
        </Text>
        <Text
          className="mt-1 uppercase"
          style={[type.archiveTitle, { color: editorialColors.ink }]}
          numberOfLines={2}
        >
          {album.album_title}
        </Text>
        <Text
          className="mt-1 uppercase"
          style={[type.archiveMeta, { color: editorialColors.muted }]}
          numberOfLines={1}
        >
          {album.album_primary_artist_name} / {date}
        </Text>
      </View>
      <ArchiveRowMark ratingScore={status.ratingScore} />
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
