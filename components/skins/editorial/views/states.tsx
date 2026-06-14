import { View } from 'react-native';

import { ruleWeight } from '@/components/skins/shared/skinStyles';
import { Skeleton } from '@/components/ui/Skeleton';
import { useEditorialPalette } from '@/theme/skins/EditorialThemeProvider';
import type { SkinComponentSet } from '@/theme/skins/types';
import { EditorialIssueFrame, EditorialProofState, EditorialStateShell } from './shared';

export function AlbumDetailProofSkeleton() {
  const palette = useEditorialPalette();
  return (
    <EditorialStateShell>
      <View className="gap-5" style={{ backgroundColor: palette.paper }}>
        <View>
          <Skeleton className="h-4 w-40 rounded-none" />
          <Skeleton className="mt-3 h-16 w-4/5 rounded-none" />
          <View className="mt-3" style={{ height: ruleWeight.heavy }}>
            <Skeleton className="h-full w-full rounded-none" />
          </View>
        </View>
        <View>
          <Skeleton className="h-10 w-11/12 rounded-none" />
          <EditorialIssueFrame>
            <Skeleton className="aspect-square w-full rounded-none" />
          </EditorialIssueFrame>
        </View>
        <View className="gap-2">
          <Skeleton className="h-8 w-full rounded-none" />
          <Skeleton className="h-5 w-2/3 rounded-none" />
        </View>
        <View className="gap-3">
          <Skeleton className="h-5 w-40 rounded-none" />
          <Skeleton className="h-5 w-full rounded-none" />
          <Skeleton className="h-5 w-5/6 rounded-none" />
        </View>
      </View>
    </EditorialStateShell>
  );
}

export function EditorialEmptyState({
  title,
  subtitle,
  actionTitle,
  onAction,
}: Parameters<SkinComponentSet['States']['EmptyState']>[0]) {
  return (
    <EditorialProofState
      label="Blank page"
      title={title}
      subtitle={subtitle}
      actionTitle={actionTitle}
      onAction={onAction}
    />
  );
}

export function EditorialErrorState({
  title,
  retrying,
  onRetry,
  secondaryTitle,
  onSecondary,
}: Parameters<SkinComponentSet['States']['ErrorState']>[0]) {
  return (
    <EditorialProofState
      label="Retry stamp"
      title={title}
      subtitle="The issue may exist, but the press room could not fetch it just now."
      actionTitle={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
      retrying={retrying}
      secondaryTitle={secondaryTitle}
      onSecondary={onSecondary}
    />
  );
}
