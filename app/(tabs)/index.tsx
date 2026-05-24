import { PlaceholderCard } from '@/components/PlaceholderCard';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function HomeScreen() {
  return (
    <Screen>
      <Text variant="h1">Альбом дня</Text>
      <Text variant="caption" className="mt-1 mb-6">
        Завтрашний пик ждёт твоего открытия
      </Text>
      <PlaceholderCard
        title="Тут будет карточка альбома"
        description="Подключим алгоритм и Spotify в фазах 2–4"
      />
    </Screen>
  );
}
