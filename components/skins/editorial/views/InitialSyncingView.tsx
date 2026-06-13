import { ActivityIndicator, View } from 'react-native';

import { BrandMark } from '@/components/brand/BrandMark';
import { EditorialActionButton } from '@/components/skins/editorial/EditorialActionButton';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import { editorialColors } from '@/components/skins/shared/skinStyles';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Text } from '@/components/ui/Text';
import type { SkinComponentSet } from '@/theme/skins/types';

export function EditorialInitialSyncingView(
  props: Parameters<SkinComponentSet['InitialSyncingView']>[0],
) {
  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ backgroundColor: editorialColors.paper }}
    >
      <View className="mb-8 border-2 p-6" style={{ borderColor: editorialColors.ink }}>
        <BrandMark size={72} muted />
      </View>
      <Text
        className="text-center font-display text-4xl uppercase leading-10"
        style={{ color: editorialColors.ink }}
      >
        {props.isFailed || props.isStale
          ? props.isStale
            ? 'Sync is slow'
            : "Couldn't read library"
          : 'Building your music profile'}
      </Text>
      <Text
        className="mt-3 mb-8 text-center font-prose text-sm leading-5"
        style={{ color: editorialColors.muted }}
      >
        {props.isFailed || props.isStale
          ? props.isStale
            ? 'You can safely restart the library import.'
            : 'Library sync could not finish. Tap below to retry.'
          : props.isStarting
            ? 'Connecting to Spotify...'
            : `Importing ${props.processed} of ${props.total || '?'}`}
      </Text>
      {!props.isStarting && props.total > 0 && !props.isFailed && !props.isStale ? (
        <View className="w-full max-w-xs">
          <ProgressBar
            ratio={props.ratio}
            height={8}
            bordered
            trackColor={editorialColors.paper}
            fillColor={editorialColors.accentStatic}
            borderColor={editorialColors.ink}
          />
        </View>
      ) : props.isFailed || props.isStale || props.showStartRetry ? (
        <EditorialActionButton
          title={props.retrying ? 'Retrying...' : 'Try again'}
          disabled={props.retrying}
          onPress={props.onRetry}
        />
      ) : (
        <ActivityIndicator color={editorialColors.accentStatic} />
      )}
      <PaperGrain />
    </View>
  );
}
