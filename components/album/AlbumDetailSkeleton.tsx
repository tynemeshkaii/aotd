import { View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';

/** First-load placeholder that mirrors the album detail layout. */
export function AlbumDetailSkeleton() {
  return (
    <View className="gap-5">
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <View className="gap-2">
        <Skeleton className="h-7 w-2/3 rounded-md" />
        <Skeleton className="h-5 w-1/2 rounded-md" />
        <Skeleton className="h-4 w-1/3 rounded-md" />
      </View>
      <Skeleton className="h-20 w-full rounded-2xl" />
      <View className="flex-row gap-3">
        <Skeleton className="h-12 flex-1 rounded-2xl" />
        <Skeleton className="h-12 w-12 rounded-2xl" />
      </View>
      <Skeleton className="h-56 w-full rounded-2xl" />
    </View>
  );
}
