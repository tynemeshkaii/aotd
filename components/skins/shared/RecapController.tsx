import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { useMonthlyRecap } from '@/lib/hooks/useMonthlyRecap';
import { useRecapMonths } from '@/lib/hooks/useRecapMonths';
import { useAccentFlowFocus } from '@/theme/skins/AccentFlowProvider';
import { useSkinComponents } from '@/theme/skins/registry';

type Props = {
  month?: string;
};

function normalizeMonth(value?: string) {
  if (!value || !/^\d{4}-\d{2}/.test(value)) return null;
  return `${value.slice(0, 7)}-01`;
}

function goBackToDiscoveries() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)/discoveries');
  }
}

function BackButton({
  color,
  borderColor,
  backgroundColor,
}: {
  color: string;
  borderColor: string;
  backgroundColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Discoveries"
      onPress={goBackToDiscoveries}
      className="h-11 w-11 items-center justify-center border-2 active:opacity-80"
      style={{ borderColor, backgroundColor }}
    >
      <Ionicons name="chevron-back" size={22} color={color} />
    </Pressable>
  );
}

export function RecapController({ month }: Props) {
  const components = useSkinComponents();
  useAccentFlowFocus();

  const monthsQuery = useRecapMonths();
  const selectedMonth = normalizeMonth(month) ?? monthsQuery.data?.[0]?.month ?? null;
  const recapQuery = useMonthlyRecap(selectedMonth);
  const backButton = (
    <BackButton
      color={components.chrome.text}
      borderColor={components.chrome.muted}
      backgroundColor={components.chrome.surface}
    />
  );

  return (
    <components.RecapView
      month={selectedMonth}
      months={monthsQuery.data ?? []}
      recap={recapQuery.data ?? null}
      loading={monthsQuery.isLoading || recapQuery.isLoading}
      error={monthsQuery.isError || recapQuery.isError}
      retrying={monthsQuery.isRefetching || recapQuery.isRefetching}
      header={backButton}
      onRetry={() => {
        void monthsQuery.refetch();
        void recapQuery.refetch();
      }}
      onMonthChange={(nextMonth) => {
        router.replace(`/discoveries/recap/${nextMonth}` as never);
      }}
      onOpenTopFinding={(aotdId) => {
        router.push(`/discoveries/${aotdId}` as never);
      }}
    />
  );
}
