import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { LibraryListItem } from '@/components/library/LibraryListItem';
import { LibrarySearchBar } from '@/components/library/LibrarySearchBar';
import { SyncBanner } from '@/components/library/SyncBanner';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useLibrary } from '@/lib/hooks/useLibrary';

export default function LibraryScreen() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useLibrary(query);

  return (
    <Screen scroll={false}>
      <Text variant="h1" className="mb-4">
        Library
      </Text>
      <SyncBanner />
      <LibrarySearchBar onChange={setQuery} value={query} />
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : (
        <FlatList
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={
            <Text variant="caption" className="mt-12 text-center">
              Library is empty. Saved albums from Spotify will appear here after sync.
            </Text>
          }
          contentContainerClassName="pb-20"
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LibraryListItem item={item} />}
        />
      )}
    </Screen>
  );
}
