import type { ReactNode } from 'react';

import { AlbumDetailController } from '@/components/skins/shared/AlbumDetailController';
import type { AlbumDiscovery } from '@/lib/recommendation';

type Props = {
  album: AlbumDiscovery;
  isToday?: boolean;
  /** Rendered above the hero (e.g. a back button on the detail screen). */
  header?: ReactNode;
  /** Rendered after the rating editor (e.g. the "past picks waiting" nudge). */
  footer?: ReactNode;
};

export function AlbumDetail({ album, isToday, header, footer }: Props) {
  return <AlbumDetailController album={album} isToday={isToday} header={header} footer={footer} />;
}
