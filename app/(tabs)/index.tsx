import { TodayCard } from '@/components/home/TodayCard';
import { WaitingForPick } from '@/components/home/WaitingForPick';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTodayPick } from '@/lib/hooks/useTodayPick';

export default function HomeScreen() {
  const { data: pick, isLoading } = useTodayPick();

  return (
    <Screen>
      <Text variant="h1">Today</Text>
      {isLoading ? null : pick ? <TodayCard pick={pick} /> : <WaitingForPick />}
    </Screen>
  );
}
