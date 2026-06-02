import { View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { copy } from '@/lib/copy';
import type { ProfileOverview } from '@/lib/hooks/useProfileOverview';

type Props = {
  taste: ProfileOverview['taste'];
};

export function TasteSection({ taste }: Props) {
  const topArtists = taste.top_artists ?? [];
  const decades = taste.decades ?? [];
  const maxDecade = decades.reduce((m, d) => Math.max(m, d.count), 0);
  const hasSpan = taste.span_min != null && taste.span_max != null;

  if (topArtists.length === 0 && decades.length === 0) {
    return (
      <Card>
        <SectionHeader title={copy.profile.tasteTitle} />
        <Text variant="caption" className="mt-2 leading-5">
          As soon as your library finishes importing, your top artists and the eras you love show up
          here.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title={copy.profile.tasteTitle}
        subtitle="A small map of what you keep close"
      />

      {topArtists.length > 0 && (
        <>
          <Text variant="label" className="mt-4 mb-2">
            Top artists
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {topArtists.map((artist) => (
              <Badge key={artist.name} label={artist.name} variant="muted" />
            ))}
          </View>
        </>
      )}

      {decades.length > 0 && (
        <>
          <Text variant="label" className="mt-5 mb-2">
            By decade
          </Text>
          <View className="gap-2">
            {decades.map((d) => (
              <View key={d.decade} className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text variant="subtle" className="font-semibold text-text">
                    {d.decade}s
                  </Text>
                  <Text variant="subtle">{d.count} albums</Text>
                </View>
                <View className="h-3 overflow-hidden rounded-full bg-surface-2">
                  <View
                    className="h-full rounded-full bg-accent/90"
                    style={{ width: `${maxDecade > 0 ? (d.count / maxDecade) * 100 : 0}%` }}
                  />
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {hasSpan && (
        <Text variant="caption" className="mt-5">
          {copy.profile.librarySpan(taste.span_min as number, taste.span_max as number)}
        </Text>
      )}
    </Card>
  );
}
