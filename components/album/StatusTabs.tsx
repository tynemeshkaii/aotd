import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';

export type DiscoveryFilter = 'all' | 'pending' | 'rated';

// The `pending` filter shows everything not yet rated (pending + opened), so
// "Unrated" matches the content — an opened-but-unrated album still belongs
// here and keeps its own per-item "Opened" badge.
const tabs: { value: DiscoveryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Unrated' },
  { value: 'rated', label: 'Rated' },
];

type Props = {
  value: DiscoveryFilter;
  onChange: (value: DiscoveryFilter) => void;
};

export function StatusTabs({ value, onChange }: Props) {
  return (
    <View className="flex-row rounded-xl border border-text/5 bg-surface p-1">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityLabel={`Show ${tab.label.toLowerCase()} discoveries`}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.value)}
            className={`min-h-11 flex-1 items-center justify-center rounded-lg ${
              selected ? 'bg-accent/15' : 'bg-transparent'
            }`}
          >
            <Text className={selected ? 'font-semibold text-accent' : 'font-semibold text-muted'}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
