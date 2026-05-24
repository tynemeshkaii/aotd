import { TextInput, View } from 'react-native';

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function LibrarySearchBar({ value, onChange }: Props) {
  return (
    <View className="mb-3 rounded-xl bg-surface px-4 py-3">
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        className="text-base text-text"
        onChangeText={onChange}
        placeholder="Search albums or artists"
        placeholderTextColor="#737373"
        returnKeyType="search"
        value={value}
      />
    </View>
  );
}
