import { Image, View } from 'react-native';

// Static paper-grain overlay. Uses core RN Image because resizeMode="repeat"
// tiles natively on both platforms. No animation — Reduce Motion irrelevant.
const grain = require('@/assets/textures/paper-grain.png');

export function PaperGrain({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" className="absolute inset-0" style={{ zIndex: 20 }}>
      <Image
        source={grain}
        resizeMode="repeat"
        style={{ width: '100%', height: '100%', opacity }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </View>
  );
}
