import { PlaceholderCard } from '@/components/PlaceholderCard';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function ProfileScreen() {
  return (
    <Screen>
      <Text variant="h1">Профиль</Text>
      <Text variant="caption" className="mt-1 mb-6">
        Настройки и стрики
      </Text>
      <PlaceholderCard
        title="Аватар, статистика, подключения"
        description="Spotify / Apple Music, время пуша, дрифт"
      />
    </Screen>
  );
}
