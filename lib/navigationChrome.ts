import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_TOP_PADDING = 0;
const TAB_BAR_ITEM_HEIGHT = 60;
const TAB_BAR_MIN_BOTTOM_PADDING = 10;
const TAB_BAR_CONTENT_GAP = 24;
const PAGE_BOTTOM_GAP = 36;

export function getTabBarTopPadding(): number {
  return TAB_BAR_TOP_PADDING;
}

export function getTabBarBottomPadding(bottomInset: number): number {
  return Math.max(bottomInset, TAB_BAR_MIN_BOTTOM_PADDING);
}

export function getTabBarItemHeight(): number {
  return TAB_BAR_ITEM_HEIGHT;
}

export function getTabBarHeight(bottomInset: number): number {
  return TAB_BAR_TOP_PADDING + TAB_BAR_ITEM_HEIGHT + getTabBarBottomPadding(bottomInset);
}

export function getTabContentBottomPadding(
  bottomInset: number,
  extraGap = TAB_BAR_CONTENT_GAP,
): number {
  return getTabBarHeight(bottomInset) + extraGap;
}

export function getPageBottomPadding(bottomInset: number): number {
  return bottomInset + PAGE_BOTTOM_GAP;
}

export function useTabContentBottomPadding(extraGap?: number): number {
  const insets = useSafeAreaInsets();
  return getTabContentBottomPadding(insets.bottom, extraGap);
}

export function usePageBottomPadding(): number {
  const insets = useSafeAreaInsets();
  return getPageBottomPadding(insets.bottom);
}
