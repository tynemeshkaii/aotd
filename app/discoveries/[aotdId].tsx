import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AlbumDetail } from '@/components/album/AlbumDetail';
import { AlbumDetailSkeleton } from '@/components/album/AlbumDetailSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { useDiscoveryDetail } from '@/lib/hooks/useDiscoveryDetail';
import colors from '@/theme/colors';

function BackButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Discoveries"
      onPress={() => router.replace('/(tabs)/discoveries')}
      className="h-10 w-10 items-center justify-center rounded-full bg-surface/80 active:opacity-80"
    >
      <Ionicons name="chevron-back" size={22} color={colors.text} />
    </Pressable>
  );
}

export default function DiscoveryDetailScreen() {
  const { aotdId } = useLocalSearchParams<{ aotdId?: string }>();
  const { data: album, isError, isLoading, isRefetching, refetch } = useDiscoveryDetail(aotdId);

  const goBack = () => router.replace('/(tabs)/discoveries');

  if (isLoading) {
    return (
      <Screen>
        <View className="mb-5">
          <BackButton />
        </View>
        <AlbumDetailSkeleton />
      </Screen>
    );
  }

  // RPC/network failure: retryable error, never a silent "not found".
  if (isError) {
    return (
      <Screen scroll={false}>
        <View className="mb-5">
          <BackButton />
        </View>
        <ErrorState
          title="Could not load this discovery."
          retrying={isRefetching}
          onRetry={() => void refetch()}
          secondaryTitle="Back to Discoveries"
          onSecondary={goBack}
        />
      </Screen>
    );
  }

  if (!album) {
    return (
      <Screen scroll={false}>
        <View className="mb-5">
          <BackButton />
        </View>
        <EmptyState
          icon="disc-outline"
          title="Discovery not found"
          subtitle="It may have been removed. Head back to your discoveries."
          actionTitle="Back to Discoveries"
          onAction={goBack}
        />
      </Screen>
    );
  }

  return <AlbumDetail album={album} header={<BackButton />} />;
}
