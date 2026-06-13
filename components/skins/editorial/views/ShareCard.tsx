import { Image, View } from 'react-native';

import { BrandMark } from '@/components/brand/BrandMark';
import { EditorialSpecLine } from '@/components/skins/editorial/EditorialSpecLine';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import { editorialColors, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import { type AlbumDiscovery, spotifyAlbumUrl } from '@/lib/recommendation';
import { albumSpec, formatIssueDate, issueNo } from '../lib';

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

function EditorialBarcode({ seed }: { seed: string }) {
  return (
    <View className="flex-row items-end" style={{ height: 56, gap: 3 }}>
      {barcodeWidths(seed).map((width, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars, order never changes
          key={index}
          style={{
            width,
            height: index % 5 === 0 ? 56 : 44,
            backgroundColor: editorialColors.ink,
          }}
        />
      ))}
    </View>
  );
}

export function EditorialShareCard({ album }: { album: AlbumDiscovery }) {
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
            style={{ color: editorialColors.muted, letterSpacing: tracking.kicker }}
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
                style={{ color: editorialColors.muted, letterSpacing: tracking.kicker }}
              >
                Artwork unavailable
              </Text>
            </View>
          )}
        </View>
        <View>
          <Text
            numberOfLines={4}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            className="font-display text-[62px] uppercase leading-[60px]"
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
          <View className="mt-5">
            <EditorialSpecLine items={albumSpec(album)} />
          </View>
        </View>
      </View>
      <View className="flex-row items-end justify-between gap-8">
        <EditorialBarcode seed={album.album_spotify_id} />
        <View className="min-w-0 flex-1 items-end">
          <Text
            className="font-mono-bold text-2xl uppercase"
            style={{ color: editorialColors.ink, letterSpacing: tracking.kicker }}
          >
            {`AOTD · No. ${issueNo(album)}`}
          </Text>
          <Text
            numberOfLines={1}
            className="mt-2 font-mono text-xl"
            style={{ color: editorialColors.muted }}
          >
            {spotifyAlbumUrl(album.album_spotify_id)}
          </Text>
        </View>
      </View>
      <PaperGrain opacity={0.06} />
    </View>
  );
}
