import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AlbumDetail } from '@/components/album/AlbumDetail';
import { Screen } from '@/components/ui/Screen';
import { useDiscoveryDetail } from '@/lib/hooks/useDiscoveryDetail';
import { useSkinComponents } from '@/theme/skins/registry';

function goBackToDiscoveries() {
  // Prefer native pop (preserves the list scroll position and the iOS
  // edge-swipe gesture); fall back to replace for cold deep links.
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

export default function DiscoveryDetailScreen() {
  const components = useSkinComponents();
  const backButton = (
    <BackButton
      color={components.chrome.text}
      borderColor={components.chrome.muted}
      backgroundColor={components.chrome.surface}
    />
  );
  const { aotdId } = useLocalSearchParams<{ aotdId?: string }>();
  const { data: album, isError, isLoading, isRefetching, refetch } = useDiscoveryDetail(aotdId);

  const goBack = goBackToDiscoveries;

  if (isLoading) {
    return (
      <Screen>
        <View className="mb-5">{backButton}</View>
        {components.States.AlbumDetailSkeleton()}
      </Screen>
    );
  }

  // RPC/network failure: retryable error, never a silent "not found".
  if (isError) {
    return (
      <Screen scroll={false}>
        <View className="mb-5">{backButton}</View>
        {components.States.ErrorState({
          title: 'Could not load this discovery.',
          retrying: isRefetching,
          onRetry: () => void refetch(),
          secondaryTitle: 'Back to Discoveries',
          onSecondary: goBack,
        })}
      </Screen>
    );
  }

  if (!album) {
    return (
      <Screen scroll={false}>
        <View className="mb-5">{backButton}</View>
        {components.States.EmptyState({
          icon: 'disc-outline',
          title: 'Discovery not found',
          subtitle: 'It may have been removed. Head back to your discoveries.',
          actionTitle: 'Back to Discoveries',
          onAction: goBack,
        })}
      </Screen>
    );
  }

  return <AlbumDetail album={album} header={backButton} />;
}
