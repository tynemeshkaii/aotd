import { View } from 'react-native';

import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';

// Print registration crop marks at the four corners of the parent. Parent must
// be position-relative; marks render in the paper margin around the cover plate.
export function EditorialCropMarks({
  length = 14,
  thickness = 2,
}: {
  length?: number;
  thickness?: number;
}) {
  const palette = useEditorialPalette();
  const bar = { position: 'absolute' as const, backgroundColor: palette.ink };
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <View style={[bar, { left: 0, top: 0, width: length, height: thickness }]} />
      <View style={[bar, { left: 0, top: 0, width: thickness, height: length }]} />
      <View style={[bar, { right: 0, top: 0, width: length, height: thickness }]} />
      <View style={[bar, { right: 0, top: 0, width: thickness, height: length }]} />
      <View style={[bar, { left: 0, bottom: 0, width: length, height: thickness }]} />
      <View style={[bar, { left: 0, bottom: 0, width: thickness, height: length }]} />
      <View style={[bar, { right: 0, bottom: 0, width: length, height: thickness }]} />
      <View style={[bar, { right: 0, bottom: 0, width: thickness, height: length }]} />
    </View>
  );
}
