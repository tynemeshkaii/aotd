import { Image, View } from 'react-native';

import { BrandMark } from '@/components/brand/BrandMark';
import { EditorialSpecLine } from '@/components/skins/editorial/EditorialSpecLine';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import { tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { type AlbumDiscovery, spotifyAlbumUrl } from '@/lib/recommendation';
import { EditorialThemeProvider, useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';
import type { ShareFormat } from '@/theme/skins/types';
import { albumSpec, issueNo } from '../lib';

// Deterministic pseudo-barcode seeded by album id — print artifact for the
// share card footer. Pure decoration, never scanned.
function barcodeWidths(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const widths: number[] = [];
  for (let i = 0; i < 24; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    widths.push(2 + (h % 3) * 2);
  }
  return widths;
}

function EditorialBarcode({ seed, light }: { seed: string; light?: boolean }) {
  const palette = useEditorialPalette();
  return (
    <View className="flex-row items-end" style={{ height: 56, gap: 3 }}>
      {barcodeWidths(seed).map((width, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars, order never changes
          key={index}
          style={{
            width,
            height: index % 5 === 0 ? 56 : 44,
            backgroundColor: light ? palette.paper : palette.ink,
          }}
        />
      ))}
    </View>
  );
}

function Artwork({ album, size }: { album: AlbumDiscovery; size: number }) {
  const palette = useEditorialPalette();
  return (
    <View
      className="border-4 p-3"
      style={{
        width: size,
        height: size,
        borderColor: palette.ink,
        backgroundColor: palette.paperAlt,
      }}
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
            style={{ color: palette.muted, letterSpacing: tracking.kicker }}
          >
            Artwork unavailable
          </Text>
        </View>
      )}
    </View>
  );
}

function RatingStamp({ score }: { score: AlbumDiscovery['rating_score'] }) {
  const palette = useEditorialPalette();
  if (!score) return null;
  return (
    <View className="border-4 px-5 py-3" style={{ borderColor: palette.red }}>
      <Text
        className="font-mono-bold text-3xl uppercase"
        style={{ color: palette.red, letterSpacing: tracking.label }}
      >
        Rated {String(score).padStart(2, '0')}
      </Text>
    </View>
  );
}

function Footer({ album, light }: { album: AlbumDiscovery; light?: boolean }) {
  const palette = useEditorialPalette();
  const color = light ? palette.paper : palette.ink;
  const muted = light ? palette.paperAlt : palette.muted;
  return (
    <View className="flex-row items-end justify-between gap-8">
      <EditorialBarcode seed={album.album_spotify_id} light={light} />
      <View className="min-w-0 flex-1 items-end">
        <Text
          className="font-mono-bold text-2xl uppercase"
          style={{ color, letterSpacing: tracking.kicker }}
        >
          {`AOTD · No. ${issueNo(album)}`}
        </Text>
        <Text numberOfLines={1} className="mt-2 font-mono text-xl" style={{ color: muted }}>
          {spotifyAlbumUrl(album.album_spotify_id)}
        </Text>
      </View>
    </View>
  );
}

function SquareShareCard({ album }: { album: AlbumDiscovery }) {
  const palette = useEditorialPalette();
  return (
    <View
      className="h-[1080px] w-[1080px] justify-between p-14"
      style={{ backgroundColor: palette.paper }}
    >
      <View className="gap-7">
        <View className="flex-row items-start justify-between gap-8">
          <View className="min-w-0 flex-1">
            <Text
              className="font-display text-[72px] uppercase leading-[68px]"
              style={{ color: palette.ink }}
            >
              Album of{'\n'}the Day
            </Text>
            <View className="mt-5 h-2" style={{ backgroundColor: palette.accentStatic }} />
          </View>
          <Text
            className="font-mono-bold text-3xl uppercase"
            style={{ color: palette.accentStatic, letterSpacing: tracking.kicker }}
          >
            No. {issueNo(album)}
          </Text>
        </View>
        <View className="items-center">
          <Artwork album={album} size={590} />
        </View>
        <View>
          <Text
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            className="font-display text-[60px] uppercase leading-[58px]"
            style={{ color: palette.ink }}
          >
            {album.album_title}
          </Text>
          <Text
            numberOfLines={2}
            className="mt-4 font-prose-bold text-4xl leading-[42px]"
            style={{ color: palette.ink }}
          >
            {album.album_primary_artist_name}
          </Text>
          <View className="mt-5">
            <EditorialSpecLine items={albumSpec(album)} />
          </View>
        </View>
      </View>
      <Footer album={album} />
      <PaperGrain opacity={0.06} />
    </View>
  );
}

function StoryShareCard({ album }: { album: AlbumDiscovery }) {
  const palette = useEditorialPalette();
  return (
    <View className="h-[1920px] w-[1080px]" style={{ backgroundColor: palette.ink }}>
      {album.album_cover_url ? (
        <Image
          source={{ uri: album.album_cover_url }}
          className="h-full w-full"
          resizeMode="cover"
        />
      ) : null}
      <View
        className="absolute inset-0 justify-between p-16"
        style={{ backgroundColor: 'rgba(29, 21, 17, 0.38)' }}
      >
        <View>
          <Text
            className="font-mono-bold text-2xl uppercase"
            style={{ color: palette.paper, letterSpacing: tracking.kicker }}
          >
            Album of the Day / No. {issueNo(album)}
          </Text>
          <View className="mt-5 h-2 w-48" style={{ backgroundColor: palette.accentStatic }} />
        </View>
        <View className="gap-5">
          <Text
            numberOfLines={5}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            className="font-display text-[92px] uppercase leading-[86px]"
            style={{ color: palette.paper }}
          >
            {album.album_title}
          </Text>
          <Text
            numberOfLines={2}
            className="font-prose-bold text-5xl leading-[56px]"
            style={{ color: palette.paper }}
          >
            {album.album_primary_artist_name}
          </Text>
        </View>
        <Footer album={album} light />
      </View>
      <PaperGrain opacity={0.06} />
    </View>
  );
}

function MinimalShareCard({ album }: { album: AlbumDiscovery }) {
  const palette = useEditorialPalette();
  return (
    <View
      className="h-[1200px] w-[900px] justify-between border-[10px] p-12"
      style={{ borderColor: palette.ink, backgroundColor: palette.paper }}
    >
      <View className="flex-1 justify-between border-4 p-10" style={{ borderColor: palette.ink }}>
        <View>
          <Text
            className="font-mono-bold text-3xl uppercase"
            style={{ color: palette.muted, letterSpacing: tracking.kicker }}
          >
            Album of the Day
          </Text>
          <Text
            className="mt-8 font-display text-[150px] uppercase leading-[138px]"
            style={{ color: palette.accentStatic }}
          >
            № {issueNo(album)}
          </Text>
        </View>
        <View className="gap-6">
          <Text
            numberOfLines={5}
            adjustsFontSizeToFit
            minimumFontScale={0.62}
            className="font-display text-[76px] uppercase leading-[72px]"
            style={{ color: palette.ink }}
          >
            {album.album_title}
          </Text>
          <Text
            numberOfLines={2}
            className="font-prose-bold text-4xl leading-[42px]"
            style={{ color: palette.ink }}
          >
            {album.album_primary_artist_name}
          </Text>
          <RatingStamp score={album.rating_score} />
        </View>
        <Footer album={album} />
      </View>
    </View>
  );
}

export function EditorialShareCard({
  album,
  format = 'square',
}: {
  album: AlbumDiscovery;
  format?: ShareFormat;
}) {
  // Shared PNGs live outside the app's dark context; capture them in the Day
  // edition regardless of the in-app edition setting.
  return (
    <EditorialThemeProvider forcedEdition="day">
      {format === 'story' ? <StoryShareCard album={album} /> : null}
      {format === 'minimal' ? <MinimalShareCard album={album} /> : null}
      {format !== 'story' && format !== 'minimal' ? <SquareShareCard album={album} /> : null}
    </EditorialThemeProvider>
  );
}
