import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand/BrandMark';
import { EditorialMasthead } from '@/components/skins/editorial/EditorialMasthead';
import { EditorialSectionRule } from '@/components/skins/editorial/EditorialSectionRule';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import { editorialColors, tracking } from '@/components/skins/shared/skinStyles';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import type { MonthlyRecap } from '@/lib/hooks/useMonthlyRecap';
import type { RecapMonth } from '@/lib/hooks/useRecapMonths';
import { getPageBottomPadding } from '@/lib/navigationChrome';
import { getRatingLabel, type RatingScore } from '@/lib/recommendation';
import type { SkinComponentSet } from '@/theme/skins/types';
import { EditorialStamp } from './shared';

type Props = Parameters<SkinComponentSet['RecapView']>[0];

function monthLabel(month?: string | null) {
  if (!month) return 'Monthly review';
  return new Date(`${month.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function modalScore(spread: MonthlyRecap['rating_spread']): RatingScore | null {
  const scores: RatingScore[] = [5, 4, 3, 2, 1];
  let best: RatingScore | null = null;
  let bestCount = 0;
  for (const score of scores) {
    const count = spread[String(score) as keyof MonthlyRecap['rating_spread']];
    if (count > bestCount) {
      best = score;
      bestCount = count;
    }
  }
  return best;
}

function editorsNote(recap: MonthlyRecap) {
  if (recap.issues_count === 0) {
    return 'No issues were printed for this month yet.';
  }
  if (recap.rated_count === 0) {
    return 'This month has issues in the archive, but none have a journal rating yet.';
  }
  const score = modalScore(recap.rating_spread);
  const label = getRatingLabel(score);
  if (!label) return 'This month is still settling into the ledger.';
  return `Mostly ${label} this month, with ${recap.rated_count} private journal ${recap.rated_count === 1 ? 'entry' : 'entries'} in the ledger.`;
}

function MonthPicker({
  months,
  selected,
  onChange,
}: {
  months: RecapMonth[];
  selected: string | null;
  onChange: (month: string) => void;
}) {
  if (months.length <= 1) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {months.slice(0, 6).map((month) => {
        const active = month.month === selected;
        return (
          <Pressable
            key={month.month}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="min-h-10 border-2 px-3 py-2"
            style={{
              borderColor: editorialColors.ink,
              backgroundColor: active ? editorialColors.ink : editorialColors.paper,
            }}
            onPress={() => onChange(month.month)}
          >
            <Text
              className="font-mono-bold text-[10px] uppercase leading-4"
              style={{
                color: active ? editorialColors.paper : editorialColors.ink,
                letterSpacing: tracking.label,
              }}
            >
              {monthLabel(month.month)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 border-2 p-3" style={{ borderColor: editorialColors.ink }}>
      <Text
        className="font-display text-[46px] uppercase leading-[44px]"
        style={{ color: editorialColors.ink, letterSpacing: 0 }}
      >
        {value}
      </Text>
      <Text
        className="mt-1 font-mono text-[10px] uppercase leading-4"
        style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
      >
        {label}
      </Text>
    </View>
  );
}

function RatingSpread({ recap }: { recap: MonthlyRecap }) {
  const max = Math.max(...Object.values(recap.rating_spread), 1);
  const peak = modalScore(recap.rating_spread);
  return (
    <View className="gap-3">
      <EditorialSectionRule title="Rating spread" />
      <View className="gap-2">
        {([5, 4, 3, 2, 1] as RatingScore[]).map((score) => {
          const count = recap.rating_spread[String(score) as keyof MonthlyRecap['rating_spread']];
          return (
            <View key={score} className="flex-row items-center gap-3">
              <Text
                className="w-28 font-mono-bold text-[10px] uppercase leading-4"
                style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
              >
                {getRatingLabel(score)}
              </Text>
              <View className="h-5 flex-1 border" style={{ borderColor: editorialColors.ink }}>
                <View
                  className="h-full"
                  style={{
                    width: `${Math.max(4, (count / max) * 100)}%`,
                    backgroundColor:
                      score === peak ? editorialColors.accentStatic : editorialColors.ink,
                  }}
                />
              </View>
              <Text
                className="w-8 text-right font-mono-bold text-[11px] uppercase"
                style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
              >
                {count}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TopFinding({ recap, onOpen }: { recap: MonthlyRecap; onOpen: (aotdId: string) => void }) {
  if (!recap.top_finding) {
    return (
      <Text className="font-prose text-sm leading-5" style={{ color: editorialColors.muted }}>
        {recap.issues_count > 0
          ? 'No top finding yet. Rate an issue from this month and it will appear here.'
          : 'No issues for this month yet.'}
      </Text>
    );
  }

  const finding = recap.top_finding;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${finding.album_title}`}
      className="min-h-20 flex-row items-center gap-3 border-2 p-3"
      style={{ borderColor: editorialColors.ink }}
      onPress={() => onOpen(finding.aotd_id)}
    >
      <View className="h-16 w-16 border-2" style={{ borderColor: editorialColors.ink }}>
        {finding.album_cover_url ? (
          <Image source={{ uri: finding.album_cover_url }} className="h-full w-full" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <BrandMark size={24} muted />
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={2}
          className="font-prose-bold text-base leading-5"
          style={{ color: editorialColors.ink }}
        >
          {finding.album_title}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-1 font-mono text-[10px] uppercase leading-4"
          style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
        >
          {finding.album_primary_artist_name}
        </Text>
      </View>
      <EditorialStamp label={`0${finding.rating_score}`} />
    </Pressable>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1" style={{ backgroundColor: editorialColors.paper }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: Math.max(16, insets.top + 8),
          paddingBottom: getPageBottomPadding(insets.bottom),
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      <PaperGrain />
    </View>
  );
}

export function EditorialRecapView({
  month,
  months,
  recap,
  loading,
  error,
  retrying,
  header,
  onRetry,
  onMonthChange,
  onOpenTopFinding,
}: Props) {
  if (loading) {
    return (
      <Shell>
        {header}
        <Skeleton className="h-16 w-4/5 rounded-none" />
        <Skeleton className="h-28 w-full rounded-none" />
        <Skeleton className="h-44 w-full rounded-none" />
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        {header}
        <Text className="font-display text-4xl uppercase" style={{ color: editorialColors.ink }}>
          Could not load the monthly review.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={retrying}
          className="min-h-12 items-center justify-center border-2 px-4"
          style={{ borderColor: editorialColors.ink, opacity: retrying ? 0.6 : 1 }}
          onPress={onRetry}
        >
          <Text
            className="font-mono-bold text-[11px] uppercase"
            style={{ color: editorialColors.ink, letterSpacing: tracking.label }}
          >
            {retrying ? 'Retrying...' : 'Retry'}
          </Text>
        </Pressable>
      </Shell>
    );
  }

  return (
    <Shell>
      {header}
      <View className="gap-3">
        <EditorialMasthead issueLabel="Monthly review" dateLabel={monthLabel(month)} />
        <Text
          className="font-display text-[54px] uppercase leading-[52px]"
          style={{ color: editorialColors.ink, letterSpacing: 0 }}
          maxFontSizeMultiplier={1.3}
        >
          The Monthly Review
        </Text>
        <MonthPicker months={months} selected={month} onChange={onMonthChange} />
      </View>

      {recap ? (
        <>
          <View className="flex-row gap-3">
            <StatCell value={String(recap.issues_count)} label="issues" />
            <StatCell value={String(recap.rated_count)} label="rated" />
          </View>
          <RatingSpread recap={recap} />
          <View className="gap-3">
            <EditorialSectionRule title="Top finding" />
            <TopFinding recap={recap} onOpen={onOpenTopFinding} />
          </View>
          <View className="gap-3">
            <EditorialSectionRule title="Editor's note" />
            <Text className="font-prose text-base leading-6" style={{ color: editorialColors.ink }}>
              {editorsNote(recap)}
            </Text>
            {recap.span_min && recap.span_max ? (
              <Text
                className="font-mono text-[10px] uppercase leading-4"
                style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
              >
                Source shelf: {recap.span_min}-{recap.span_max}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <Text className="font-prose text-base leading-6" style={{ color: editorialColors.muted }}>
          No monthly review is available yet.
        </Text>
      )}
    </Shell>
  );
}
