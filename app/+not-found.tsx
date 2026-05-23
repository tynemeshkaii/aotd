import { Link, Stack } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <Screen>
        <Text variant="h1">404</Text>
        <Text variant="body" className="mt-2">
          Этого экрана не существует.
        </Text>
        <Link href="/" className="mt-6">
          <Text variant="body" className="text-accent">
            На главную
          </Text>
        </Link>
      </Screen>
    </>
  );
}
