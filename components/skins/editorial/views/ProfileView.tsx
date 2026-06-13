import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentRule } from '@/components/skins/editorial/accent/AccentRule';
import { EditorialActionButton } from '@/components/skins/editorial/EditorialActionButton';
import { EditorialMasthead } from '@/components/skins/editorial/EditorialMasthead';
import { EditorialSectionRule } from '@/components/skins/editorial/EditorialSectionRule';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import { editorialColors, tracking } from '@/components/skins/shared/skinStyles';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { copy } from '@/lib/copy';
import { relativeTime } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { getTabContentBottomPadding } from '@/lib/navigationChrome';
import type { SkinComponentSet } from '@/theme/skins/types';
import { EditorialSyncBanner } from './SyncBanner';

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
        style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
      >
        {label}
      </Text>
    </View>
  );
}

function romanNumeral(value: number) {
  const numerals: [number, string][] = [
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let remaining = Math.min(99, Math.max(0, Math.floor(value)));
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

function formatSubscriberSince(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function StatStripCell({
  value,
  label,
  loading,
  isFirst,
}: {
  value: string;
  label: string;
  loading?: boolean;
  isFirst: boolean;
}) {
  return (
    <View
      className="flex-1 px-3 py-3"
      style={{ borderLeftWidth: isFirst ? 0 : 1, borderLeftColor: editorialColors.ink }}
    >
      {loading ? (
        <Skeleton className="h-[38px] w-4/5 rounded-none" />
      ) : (
        <Text
          className="font-display text-[38px] uppercase leading-[38px]"
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
        style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
      >
        {label}
      </Text>
    </View>
  );
}

function StatStrip({
  stats,
  loading,
}: {
  stats: { value: string; label: string }[];
  loading?: boolean;
}) {
  return (
    <View className="flex-row border-2" style={{ borderColor: editorialColors.ink }}>
      {stats.map((stat, index) => (
        <StatStripCell
          key={stat.label}
          value={stat.value}
          label={stat.label}
          loading={loading}
          isFirst={index === 0}
        />
      ))}
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
      style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
    >
      {copy.profile.librarySpan(min, max)}
    </Text>
  );
}

function EditorialArchiveLink({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = React.useState(false);
  const foreground = pressed ? editorialColors.paper : editorialColors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        setPressed(false);
        haptics.impactLight();
        onPress();
      }}
      className="min-h-12 flex-row items-center justify-between border-2 px-3 py-3"
      style={{
        borderColor: editorialColors.ink,
        backgroundColor: pressed ? editorialColors.ink : 'transparent',
      }}
    >
      <Text
        className="font-mono-bold text-xs uppercase leading-4"
        style={{ color: foreground, letterSpacing: tracking.label }}
      >
        Open rated archive
      </Text>
      <Ionicons name="arrow-forward" size={18} color={foreground} />
    </Pressable>
  );
}

export function EditorialProfileView(props: Parameters<SkinComponentSet['ProfileView']>[0]) {
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
  const subscriberSince = formatSubscriberSince(props.profile?.created_at);
  const volumeLabel = streak > 0 ? romanNumeral(streak) : null;

  return (
    <View className="flex-1" style={{ backgroundColor: editorialColors.paper }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: Math.max(16, insets.top + 8),
          paddingBottom: bottomPadding,
          gap: 24,
        }}
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
          <EditorialMasthead issueLabel="Private edition" />
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
            style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
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
                style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
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
                  {subscriberSince || volumeLabel ? (
                    <View className="mt-3 flex-row flex-wrap items-center gap-2">
                      {subscriberSince ? (
                        <Text
                          className="font-mono-bold text-[10px] uppercase leading-4"
                          style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
                        >
                          Subscriber since {subscriberSince}
                        </Text>
                      ) : null}
                      {volumeLabel ? (
                        <View
                          className="border-2 px-2 py-1"
                          style={{ borderColor: editorialColors.accentStatic }}
                        >
                          <Text
                            className="font-mono-bold text-[10px] uppercase leading-4"
                            style={{
                              color: editorialColors.accentStatic,
                              letterSpacing: tracking.label,
                            }}
                          >
                            {`Vol. ${volumeLabel}`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </View>

        <View className="border-b-2 pb-4" style={{ borderColor: editorialColors.ink }}>
          <StatStrip
            loading={props.overviewLoading}
            stats={[
              { value: String(streak), label: 'day streak' },
              { value: String(discovered), label: 'issues' },
              { value: String(rated), label: 'rated' },
            ]}
          />
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
                <View className="border-y-2" style={{ borderColor: editorialColors.ink }}>
                  {artists.slice(0, 6).map((artist, index) => (
                    <View
                      key={artist.name}
                      className="flex-row items-start gap-3 py-3"
                      style={{
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: editorialColors.ink,
                      }}
                    >
                      <Text
                        className="w-9 font-mono-bold text-[11px] uppercase leading-5"
                        style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
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
                          style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
                        >
                          {artist.count}
                        </Text>
                        <Text
                          className="font-mono text-[10px] uppercase leading-4"
                          style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
                        >
                          saves
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
              {decades.length > 0 ? (
                <View className="border-y-2 py-3" style={{ borderColor: editorialColors.ink }}>
                  {decades.map((decade) => (
                    <View key={decade.decade} className="gap-2 py-2">
                      <View className="flex-row items-end justify-between gap-3">
                        <Text
                          className="font-mono-bold text-[11px] uppercase"
                          style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
                        >
                          {decade.decade}s
                        </Text>
                        <Text
                          className="font-mono text-[11px] uppercase"
                          style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
                        >
                          {decade.count} albums
                        </Text>
                      </View>
                      <View
                        className="h-6 flex-row items-center border-2 p-[2px]"
                        style={{ borderColor: editorialColors.ink }}
                      >
                        <View
                          className="h-full"
                          style={{
                            width: `${maxDecade ? Math.max(4, (decade.count / maxDecade) * 100) : 0}%`,
                            backgroundColor: editorialColors.ink,
                          }}
                        />
                        <View className="ml-1 h-full flex-1 flex-row gap-[3px]">
                          {[0, 1, 2, 3].map((tick) => (
                            <View
                              key={tick}
                              className="h-full flex-1"
                              style={{ backgroundColor: editorialColors.paperAlt }}
                            />
                          ))}
                        </View>
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
                  style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
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

        <View className="gap-4 border-t pt-5" style={{ borderColor: editorialColors.ink }}>
          <EditorialSectionRule title="Production notes" aside="library" major />
          <Text
            className="font-mono text-[11px] uppercase leading-5"
            style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
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

        <View className="gap-4 border-t pt-5" style={{ borderColor: editorialColors.ink }}>
          <EditorialSectionRule title="Connections" aside="spotify" major />
          <Text className="font-prose text-base leading-6" style={{ color: editorialColors.ink }}>
            {props.connection
              ? `Spotify connected${props.profile?.display_name ? ` as ${props.profile.display_name}` : ''}`
              : 'No Spotify connection yet'}
          </Text>
          {props.connection?.connected_at ? (
            <Text
              className="font-mono text-[11px] uppercase leading-4"
              style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
            >
              Connected {relativeTime(props.connection.connected_at)}
            </Text>
          ) : null}
        </View>

        <View className="mt-3 border-t-2 pt-6" style={{ borderColor: editorialColors.ink }}>
          <EditorialActionButton title="Log out" tone="red" onPress={props.onSignOut} />
        </View>
      </ScrollView>
      <PaperGrain />
    </View>
  );
}
