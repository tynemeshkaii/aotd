import type { AlbumDiscovery } from '@/lib/recommendation';
import { useSkinComponents } from '@/theme/skins/registry';

type Props = {
  album: AlbumDiscovery;
};

export function ShareCard({ album }: Props) {
  const components = useSkinComponents();
  return <components.ShareCard album={album} />;
}
