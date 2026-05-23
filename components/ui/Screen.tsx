import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
  scroll?: boolean;
};

export function Screen({ children, scroll = true }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-4 pb-8"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-5 pt-4 pb-8">{children}</View>
      )}
    </SafeAreaView>
  );
}
