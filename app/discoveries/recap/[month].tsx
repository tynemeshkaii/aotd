import { useLocalSearchParams } from 'expo-router';

import { RecapController } from '@/components/skins/shared/RecapController';

export default function MonthlyRecapRoute() {
  const { month } = useLocalSearchParams<{ month?: string }>();
  return <RecapController month={month} />;
}
