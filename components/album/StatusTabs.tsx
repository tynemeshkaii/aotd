import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';

export type DiscoveryFilter = 'all' | 'pending' | 'rated';

const tabs: { value: DiscoveryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'rated', label: 'Rated' },
];

type Props = {
  value: DiscoveryFilter;
  onChange: (value: DiscoveryFilter) => void;
};

export function StatusTabs({ value, onChange }: Props) {
  return (
    <View className="flex-row rounded-lg bg-surface p-1">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.value)}
            className={`h-10 flex-1 items-center justify-center rounded-md ${
              selected ? 'bg-accent' : 'bg-transparent'
            }`}
          >
            <Text className={selected ? 'font-semibold text-bg' : 'font-semibold text-muted'}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
