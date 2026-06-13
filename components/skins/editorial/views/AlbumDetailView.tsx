import { RefreshControl, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle } from 'react-native-reanimated';

import { BrandMark } from '@/components/brand/BrandMark';
import { AccentRule } from '@/components/skins/editorial/accent/AccentRule';
import { AccentText } from '@/components/skins/editorial/accent/AccentText';
import { EditorialAlbumActions } from '@/components/skins/editorial/EditorialAlbumActions';
import { EditorialMarker } from '@/components/skins/editorial/EditorialMarker';
import { EditorialSectionRule } from '@/components/skins/editorial/EditorialSectionRule';
import { EditorialSpecLine } from '@/components/skins/editorial/EditorialSpecLine';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import {
  editorialColors,
  editorialType,
  space,
  tracking,
  zIndex,
} from '@/components/skins/shared/skinStyles';
import { CoverImage } from '@/components/ui/CoverImage';
import { Text } from '@/components/ui/Text';
import { getPageBottomPadding, getTabContentBottomPadding } from '@/lib/navigationChrome';
import { formatSelectionReason } from '@/lib/recommendation';
import type { SkinComponentSet } from '@/theme/skins/types';
import { albumCoverMarkers, albumSpec, formatIssueDate, issueNo } from '../lib';
import { EditorialRatingEditor } from './RatingEditor';
import { EditorialIssueFrame, ReasonParagraph } from './shared';

const type = editorialType;

export function EditorialAlbumDetailView(
  props: Parameters<SkinComponentSet['AlbumDetailView']>[0],
) {
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
        className="absolute left-0 right-0 top-0"
        style={{
          zIndex: zIndex.safeAreaPatch,
          height: props.topInset,
          backgroundColor: editorialColors.paper,
        }}
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
                className="mt-2 lowercase"
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

          <View style={{ marginTop: space.s6 }}>
            <View style={{ zIndex: zIndex.titleOverCover }}>
              <Text
                className="uppercase"
                style={[type.display34, { color: editorialColors.ink }]}
                numberOfLines={4}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={1.4}
              >
                {props.album.album_title}
              </Text>
            </View>
            <View style={{ marginTop: -14, zIndex: zIndex.coverPlate }}>
              <EditorialIssueFrame>
                <View className="aspect-square w-full">
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
                    <View
                      className="absolute bottom-2 right-2 flex-row gap-2"
                      style={{ zIndex: zIndex.markers }}
                    >
                      {markers.map((marker) => (
                        <EditorialMarker key={marker} label={marker} />
                      ))}
                    </View>
                  ) : null}
                </View>
              </EditorialIssueFrame>
            </View>
          </View>

          <View style={{ marginTop: space.s4 }}>
            <EditorialSpecLine items={albumSpec(props.album)} />
          </View>

          <View style={{ marginTop: space.s5 }}>
            <EditorialSectionRule title="Why this one?" weight="heavy" />
            <View className="mt-3">
              <ReasonParagraph text={formatSelectionReason(props.album.selection_reason)} />
            </View>
          </View>

          <View style={{ marginTop: space.s6 }}>
            <EditorialAlbumActions
              opening={props.opening}
              sharing={props.sharing}
              onOpen={props.onOpen}
              onShare={props.onShare}
            />
            <Text
              className="mt-2 font-mono text-[10px] uppercase leading-4"
              style={{ color: editorialColors.muted, letterSpacing: tracking.micro }}
            >
              Powered by Spotify
            </Text>
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
                style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
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

          <View style={{ marginTop: props.isFreeSpotify ? space.s5 : space.s6 }}>
            <EditorialRatingEditor album={props.album} />
          </View>
          {props.footer ? <View style={{ marginTop: space.s6 }}>{props.footer}</View> : null}
        </View>
      </Animated.ScrollView>
      <PaperGrain />
    </View>
  );
}
