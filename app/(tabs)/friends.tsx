import { PlaceholderCard } from '@/components/PlaceholderCard';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function FriendsScreen() {
  return (
    <Screen>
      <Text variant="h1">Друзья</Text>
      <Text variant="caption" className="mt-1 mb-6">
        Что слушают близкие
      </Text>
      <PlaceholderCard
        title="Лента активности друзей"
        description="Реакции, треды, общие альбомы"
      />
    </Screen>
  );
}
