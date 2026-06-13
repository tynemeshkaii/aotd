import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpotifyButton } from '@/components/auth/SpotifyButton';
import { AccentRule } from '@/components/skins/editorial/accent/AccentRule';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import { editorialColors, tracking } from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';
import type { SkinComponentSet } from '@/theme/skins/types';

export function EditorialSignInView({
  loading,
  onSignIn,
}: Parameters<SkinComponentSet['SignInView']>[0]) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 justify-between px-5"
      style={{
        backgroundColor: editorialColors.paper,
        paddingTop: insets.top + 28,
        paddingBottom: insets.bottom + 28,
      }}
    >
      <View className="gap-4">
        <Text
          className="font-display text-[62px] uppercase leading-[60px]"
          style={{ color: editorialColors.ink, letterSpacing: 0 }}
        >
          Album of the Day
        </Text>
        <AccentRule />
        <Text className="font-prose text-base leading-6" style={{ color: editorialColors.ink }}>
          One record a day, chosen from the edges of your Spotify taste.
        </Text>
        <Text
          className="font-mono text-[11px] uppercase leading-4"
          style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
        >
          ( private journal / no genre math / no skips )
        </Text>
      </View>
      <View className="gap-4 border-2 p-4" style={{ borderColor: editorialColors.ink }}>
        <SpotifyButton disabled={loading} loading={loading} onPress={onSignIn} />
        <Text
          className="text-center font-prose text-sm leading-5"
          style={{ color: editorialColors.muted }}
        >
          We use your saved music to avoid the obvious. Tokens stay server-side and ratings stay
          private.
        </Text>
      </View>
      <PaperGrain />
    </View>
  );
}
