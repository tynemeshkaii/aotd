import { Image, type ImageProps } from 'expo-image';
import { cssInterop } from 'nativewind';

// expo-image is a third-party component, so NativeWind doesn't wire `className`
// to its `style` automatically. Register it once here.
cssInterop(Image, { className: 'style' });

const BLURHASH_PLACEHOLDER = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4';

type Props = Omit<ImageProps, 'source'> & {
  uri?: string | null;
  className?: string;
};

/**
 * Centralized cover renderer over expo-image: disk+memory cache, graceful
 * cross-fade, and a neutral placeholder. Use for every album cover (hero,
 * list thumbnails, backdrop). NOTE: ShareCard intentionally stays on RN Image
 * so react-native-view-shot captures reliably — do not route it through here.
 */
export function CoverImage({ uri, className, ...rest }: Props) {
  return (
    <Image
      source={uri ? { uri } : undefined}
      placeholder={{ blurhash: BLURHASH_PLACEHOLDER }}
      contentFit="cover"
      transition={220}
      cachePolicy="memory-disk"
      className={className}
      {...rest}
    />
  );
}
