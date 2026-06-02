import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import colors from '@/theme/colors';

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
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      className={`min-h-14 w-full flex-row items-center justify-center bg-spotify px-6 active:opacity-80 ${
        disabled ? 'opacity-60' : ''
      }`}
      disabled={disabled}
      onPress={onPress}
    >
      <View className="absolute left-6">
        {loading ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <FontAwesome name="spotify" color={colors.bg} size={24} />
        )}
      </View>
      <Text
        numberOfLines={1}
        className="px-8 text-center font-mono-bold text-sm uppercase text-bg"
        style={{ letterSpacing: 0.8 }}
        maxFontSizeMultiplier={1.3}
      >
        {loading ? 'Opening Spotify...' : 'Continue with Spotify'}
      </Text>
    </Pressable>
  );
}
