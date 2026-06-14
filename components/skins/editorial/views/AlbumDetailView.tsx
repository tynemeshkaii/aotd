import { useState } from 'react';
import { type LayoutChangeEvent, RefreshControl, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle } from 'react-native-reanimated';

import { BrandMark } from '@/components/brand/BrandMark';
import { AccentRule } from '@/components/skins/editorial/accent/AccentRule';
import { AccentText } from '@/components/skins/editorial/accent/AccentText';
import { EditorialAlbumActions } from '@/components/skins/editorial/EditorialAlbumActions';
import { EditorialMarker } from '@/components/skins/editorial/EditorialMarker';
import { EditorialMasthead } from '@/components/skins/editorial/EditorialMasthead';
import { EditorialSectionRule } from '@/components/skins/editorial/EditorialSectionRule';
import { EditorialSpecLine } from '@/components/skins/editorial/EditorialSpecLine';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import { HalftoneOverlay } from '@/components/skins/editorial/skia/HalftoneOverlay';
import { SkiaErrorBoundary } from '@/components/skins/editorial/skia/SkiaErrorBoundary';
import { editorialType, space, tracking, zIndex } from '@/components/skins/shared/skinStyles';
import { CoverImage } from '@/components/ui/CoverImage';
import { Text } from '@/components/ui/Text';
import { getPageBottomPadding, getTabContentBottomPadding } from '@/lib/navigationChrome';
import { formatSelectionReason } from '@/lib/recommendation';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';
import type { SkinComponentSet } from '@/theme/skins/types';
import { albumCoverMarkers, albumSpec, formatIssueDate, issueNo } from '../lib';
import { EditorialRatingEditor } from './RatingEditor';
import { EditorialIssueFrame, ReasonParagraph } from './shared';

const type = editorialType;

export function EditorialAlbumDetailView(
  props: Parameters<SkinComponentSet['AlbumDetailView']>[0],
) {
  const palette = useEditorialPalette();
  const [coverSide, setCoverSide] = useState(0);
  const date = formatIssueDate(props.album.pick_date);
  const markers = albumCoverMarkers(props.album);
  const showStandaloneKicker = !props.isToday && !props.header;
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
    <View className="flex-1" style={{ backgroundColor: palette.paper }}>
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 top-0"
        style={{
          zIndex: zIndex.safeAreaPatch,
          height: props.topInset,
          backgroundColor: palette.paper,
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
              tintColor={palette.ink}
              colors={[palette.ink]}
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
          {props.isToday ? (
            <View style={{ marginBottom: space.s4 }}>
              <EditorialMasthead issueLabel={`№${issueNo(props.album)}`} dateLabel={date} reveal />
            </View>
          ) : null}
          {props.header && !props.isToday ? (
            <View className="flex-row items-center justify-between gap-4">
              {props.header}
              <Text
                className="shrink uppercase"
                style={[type.monoKicker, { color: palette.muted }]}
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
              <Text className="uppercase" style={[type.monoKicker, { color: palette.muted }]}>
                {`№${issueNo(props.album)} · ${date}`}
              </Text>
            ) : null}
            {props.isToday ? (
              <Text
                className="mt-2 lowercase"
                style={[type.display34, { color: palette.ink }]}
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
                style={[type.display34, { color: palette.ink }]}
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
                <View
                  className="aspect-square w-full"
                  onLayout={(e: LayoutChangeEvent) =>
                    setCoverSide(Math.round(e.nativeEvent.layout.width))
                  }
                >
                  <Animated.View style={[{ flex: 1 }, coverStyle]}>
                    {props.album.album_cover_url ? (
                      <CoverImage uri={props.album.album_cover_url} className="h-full w-full" />
                    ) : (
                      <View className="h-full w-full items-center justify-center px-8">
                        <BrandMark size={84} muted />
                        <Text
                          className="mt-5 text-center font-display text-3xl uppercase"
                          style={{ color: palette.muted }}
                        >
                          Cover unavailable
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                  {props.album.album_cover_url && coverSide > 0 ? (
                    <SkiaErrorBoundary>
                      <HalftoneOverlay size={coverSide} tint={palette.ink} />
                    </SkiaErrorBoundary>
                  ) : null}
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
              shareFormat={props.shareFormat}
              onOpen={props.onOpen}
              onShare={props.onShare}
              onShareFormatChange={props.onShareFormatChange}
            />
            <Text
              className="mt-2 font-mono text-[10px] uppercase leading-4"
              style={{ color: palette.muted, letterSpacing: tracking.micro }}
            >
              Powered by Spotify
            </Text>
          </View>

          {props.isFreeSpotify ? (
            <View
              className="mt-6 border-2 px-3 py-2"
              style={{
                borderColor: palette.ink,
                backgroundColor: palette.paperAlt,
              }}
            >
              <Text
                className="mb-1 font-mono-bold text-[10px] uppercase leading-4"
                style={{ color: palette.muted, letterSpacing: tracking.label }}
              >
                Spotify Free
              </Text>
              <Text className="font-prose-medium text-sm leading-5" style={{ color: palette.ink }}>
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
