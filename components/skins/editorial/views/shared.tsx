import type * as React from 'react';
import { View } from 'react-native';

import { EditorialActionButton } from '@/components/skins/editorial/EditorialActionButton';
import { EditorialCropMarks } from '@/components/skins/editorial/EditorialCropMarks';
import { EditorialSectionRule } from '@/components/skins/editorial/EditorialSectionRule';
import { PaperGrain } from '@/components/skins/editorial/PaperGrain';
import {
  editorialColors,
  editorialType,
  space,
  tracking,
} from '@/components/skins/shared/skinStyles';
import { Text } from '@/components/ui/Text';

const type = editorialType;

// Rubber-stamp marker: stamp red, slight rotation. Decorative — the ballot
// itself carries the selected state for accessibility.
export function EditorialStamp({ label }: { label: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="self-start border-2 px-2 py-1"
      style={{ borderColor: editorialColors.red, transform: [{ rotate: '-3deg' }] }}
    >
      <Text
        className="font-mono-bold text-[11px] uppercase leading-4"
        style={{ color: editorialColors.red, letterSpacing: tracking.kicker }}
      >
        {label}
      </Text>
    </View>
  );
}

// Magazine-style raised initial: first letter set in display face inline.
// True wrapped drop caps are not reliable in RN, so the cap is raised, not dropped.
export function ReasonParagraph({ text }: { text: string }) {
  const trimmed = text.trim();
  const first = trimmed.charAt(0);
  const rest = trimmed.slice(1);
  if (!/[A-Za-z]/.test(first)) {
    return <Text style={[type.proseReason, { color: editorialColors.ink }]}>{trimmed}</Text>;
  }
  return (
    <Text style={[type.proseReason, { color: editorialColors.ink }]}>
      <Text
        style={{
          fontFamily: 'Archivo_800ExtraBold',
          fontSize: 24,
          lineHeight: 24,
          color: editorialColors.ink,
        }}
      >
        {first.toUpperCase()}
      </Text>
      {rest}
    </Text>
  );
}

export function EditorialStateShell({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1" style={{ backgroundColor: editorialColors.paper }}>
      <View className="flex-1">{children}</View>
      <PaperGrain />
    </View>
  );
}

export function EditorialIssueFrame({
  children,
  padding = space.s3,
}: {
  children: React.ReactNode;
  padding?: number;
}) {
  return (
    <View style={{ padding }}>
      <EditorialCropMarks />
      <View
        className="overflow-hidden border-2"
        style={{ borderColor: editorialColors.ink, backgroundColor: editorialColors.paperAlt }}
      >
        {children}
      </View>
    </View>
  );
}

export function EditorialProofState({
  label,
  title,
  subtitle,
  actionTitle,
  onAction,
  retrying,
  secondaryTitle,
  onSecondary,
}: {
  label: string;
  title: string;
  subtitle?: string;
  actionTitle?: string;
  onAction?: () => void;
  retrying?: boolean;
  secondaryTitle?: string;
  onSecondary?: () => void;
}) {
  return (
    <EditorialStateShell>
      <View className="flex-1 justify-center gap-4 px-5 py-12">
        <EditorialSectionRule title={label} major />
        <View className="border-2 p-4" style={{ borderColor: editorialColors.ink }}>
          <Text
            className="font-mono-bold text-[11px] uppercase leading-4"
            style={{ color: editorialColors.muted, letterSpacing: tracking.label }}
          >
            AOTD proof sheet
          </Text>
          <Text
            className="mt-3 font-display text-3xl uppercase leading-8"
            style={{ color: editorialColors.ink, letterSpacing: 0 }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="mt-3 font-prose text-base leading-6"
              style={{ color: editorialColors.muted }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actionTitle && onAction ? (
          <EditorialActionButton
            title={retrying ? 'Retrying...' : actionTitle}
            loading={retrying}
            onPress={onAction}
          />
        ) : null}
        {secondaryTitle && onSecondary ? (
          <EditorialActionButton title={secondaryTitle} tone="red" onPress={onSecondary} />
        ) : null}
      </View>
    </EditorialStateShell>
  );
}
