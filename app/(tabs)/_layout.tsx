import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useSession } from '@/components/auth/AuthProvider';
import { useSkinComponents } from '@/theme/skins/registry';

export default function TabsLayout() {
  const { session, loading } = useSession();
  const { chrome } = useSkinComponents();

  if (!loading && !session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 76,
          paddingTop: 8,
          paddingBottom: 12,
          backgroundColor: chrome.tabBar.backgroundColor,
          borderTopColor: chrome.tabBar.borderTopColor,
          borderTopWidth: chrome.id === 'editorial' ? 2 : 1,
        },
        tabBarItemStyle: {
          borderRadius: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'SpaceMono_700Bold',
          textTransform: 'uppercase',
        },
        tabBarActiveTintColor: chrome.tabBar.activeTintColor,
        tabBarInactiveTintColor: chrome.tabBar.inactiveTintColor,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="disc" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="discoveries"
        options={{
          title: 'Discoveries',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
