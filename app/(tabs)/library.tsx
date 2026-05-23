import { PlaceholderCard } from '@/components/PlaceholderCard';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function LibraryScreen() {
  return (
    <Screen>
      <Text variant="h1">Библиотека</Text>
      <Text variant="caption" className="mt-1 mb-6">
        Альбомы, которые ты сохранил
      </Text>
      <PlaceholderCard
        title="Здесь будет список сохранённых альбомов"
        description="С группировкой по тегам и фильтрами"
      />
    </Screen>
  );
}
