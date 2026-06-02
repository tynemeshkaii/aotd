import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/components/auth/AuthProvider';
import { haptics } from '@/lib/haptics';
import {
  getTabBarBottomPadding,
  getTabBarHeight,
  getTabBarItemHeight,
  getTabBarTopPadding,
} from '@/lib/navigationChrome';
import { useSkinComponents } from '@/theme/skins/registry';

type TabIconName = ComponentProps<typeof Ionicons>['name'];

type EditorialTabIconProps = {
  focused: boolean;
  color: string;
  label: string;
  icon: TabIconName;
  focusedIcon: TabIconName;
};

function EditorialTabIcon({ focused, color, label, icon, focusedIcon }: EditorialTabIconProps) {
  const { chrome } = useSkinComponents();
  const tabBar = chrome.tabBar;

  return (
    <View className="h-[54px] min-w-[88px] items-center justify-start pt-1">
      <View
        className="mb-2 h-[3px] w-8"
        style={{
          backgroundColor: focused ? tabBar.activeIndicatorColor : 'transparent',
        }}
      />
      <Ionicons
        name={focused ? focusedIcon : icon}
        color={color}
        size={tabBar.iconSize}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text
        allowFontScaling
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        adjustsFontSizeToFit
        className="mt-[3px] text-center uppercase"
        style={{
          color,
          fontFamily: tabBar.labelFontFamily,
          fontSize: tabBar.labelFontSize,
          letterSpacing: 0,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function EditorialTabButton({ onPress, ...props }: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPress={(event) => {
        haptics.selection();
        onPress?.(event);
      }}
      pressOpacity={0.72}
    />
  );
}

export default function TabsLayout() {
  const { session, loading } = useSession();
  const { chrome } = useSkinComponents();
  const insets = useSafeAreaInsets();
  const tabBarHeight = getTabBarHeight(insets.bottom);
  const tabBarTopPadding = getTabBarTopPadding();
  const tabBarBottomPadding = getTabBarBottomPadding(insets.bottom);
  const tabBarItemHeight = getTabBarItemHeight();

  if (!loading && !session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarButton: (props) => <EditorialTabButton {...props} />,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: tabBarTopPadding,
          paddingBottom: tabBarBottomPadding,
          backgroundColor: chrome.tabBar.backgroundColor,
          borderTopColor: chrome.tabBar.borderTopColor,
          borderTopWidth: chrome.tabBar.borderTopWidth,
        },
        tabBarItemStyle: {
          borderRadius: 0,
          height: tabBarItemHeight,
        },
        tabBarIconStyle: { marginTop: 0 },
        tabBarActiveTintColor: chrome.tabBar.activeTintColor,
        tabBarInactiveTintColor: chrome.tabBar.inactiveTintColor,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <EditorialTabIcon
              label="Home"
              icon="disc-outline"
              focusedIcon="disc"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="discoveries"
        options={{
          title: 'Discoveries',
          tabBarAccessibilityLabel: 'Discoveries',
          tabBarIcon: ({ color, focused }) => (
            <EditorialTabIcon
              label="Discoveries"
              icon="archive-outline"
              focusedIcon="archive"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <EditorialTabIcon
              label="Profile"
              icon="person-circle-outline"
              focusedIcon="person-circle"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
