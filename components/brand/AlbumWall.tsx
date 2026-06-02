import { View } from 'react-native';

import { BrandMark } from './BrandMark';

const sleeves = [
  'bg-primary',
  'bg-accent',
  'bg-surface-2',
  'bg-rate-liked',
  'bg-rate-bad',
  'bg-surface',
  'bg-rate-notforme',
  'bg-rate-alright',
  'bg-primary',
];

export function AlbumWall() {
  return (
    <View className="relative h-64 w-full overflow-hidden rounded-2xl border border-text/10 bg-surface p-4">
      <View className="absolute inset-0 bg-primary/10" />
      <View className="flex-row flex-wrap gap-3 opacity-95">
        {sleeves.map((className, index) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative grid
            key={index}
            className={`h-[70px] w-[70px] overflow-hidden rounded-lg ${className}`}
            style={{
              transform: [{ rotate: `${(index % 3) - 1}deg` }],
            }}
          >
            <View className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-bg/35" />
            <View className="absolute right-2 top-2 h-7 w-7 rounded-full border border-bg/50 bg-bg/25" />
          </View>
        ))}
      </View>
      <View className="absolute bottom-5 left-5 flex-row items-center gap-3">
        <BrandMark size={44} />
        <View className="h-10 w-32 rounded-lg bg-bg/55" />
      </View>
    </View>
  );
}
