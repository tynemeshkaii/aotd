import { View } from 'react-native';

import { Card } from '@/components/ui/Card';
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
        <Text variant="h3">{copy.profile.tasteTitle}</Text>
        <Text variant="caption" className="mt-2 leading-5">
          As soon as your library finishes importing, your top artists and the eras you love show up
          here.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text variant="h3">{copy.profile.tasteTitle}</Text>

      {topArtists.length > 0 && (
        <>
          <Text variant="label" className="mt-4 mb-2">
            Top artists
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {topArtists.map((artist) => (
              <View key={artist.name} className="rounded-full bg-surface-2 px-3 py-1.5">
                <Text variant="caption" className="text-text">
                  {artist.name}
                </Text>
              </View>
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
              <View key={d.decade} className="flex-row items-center gap-3">
                <Text variant="subtle" className="w-12">
                  {d.decade}s
                </Text>
                <View className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <View
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${maxDecade > 0 ? (d.count / maxDecade) * 100 : 0}%` }}
                  />
                </View>
                <Text variant="subtle" className="w-8 text-right">
                  {d.count}
                </Text>
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
