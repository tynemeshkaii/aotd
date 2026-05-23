import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';

type Props = {
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
};

export function SpotifyButton({ disabled, loading, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Spotify"
      className={`h-14 w-full flex-row items-center justify-center rounded-full bg-accent px-6 active:opacity-80 ${
        disabled ? 'opacity-60' : ''
      }`}
      disabled={disabled}
      onPress={onPress}
    >
      <View className="absolute left-6">
        {loading ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <FontAwesome name="spotify" color="#0a0a0a" size={24} />
        )}
      </View>
      <Text className="text-bg font-bold">
        {loading ? 'Opening Spotify...' : 'Continue with Spotify'}
      </Text>
    </Pressable>
  );
}
