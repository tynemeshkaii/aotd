import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { AlbumDiscovery } from '@/lib/recommendation';
import { formatSelectionReason } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
};

export function WhyThisAlbum({ album }: Props) {
  return (
    <Card variant="glass">
      <Text variant="label" className="mb-2">
        Why this album
      </Text>
      <Text variant="body" className="leading-6">
        {formatSelectionReason(album.selection_reason)}
      </Text>
    </Card>
  );
}
