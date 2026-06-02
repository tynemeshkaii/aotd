import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePageBottomPadding } from '@/lib/navigationChrome';
import { useSkinComponents } from '@/theme/skins/registry';

type Props = {
  children: ReactNode;
  scroll?: boolean;
};

export function Screen({ children, scroll = true }: Props) {
  const { chrome } = useSkinComponents();
  const insets = useSafeAreaInsets();
  const bottomPadding = usePageBottomPadding();

  return (
    <View
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: chrome.rootBackground }}
    >
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-4"
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-5 pt-4" style={{ paddingBottom: bottomPadding }}>
          {children}
        </View>
      )}
    </View>
  );
}
