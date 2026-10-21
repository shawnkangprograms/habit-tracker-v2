import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { startNotificationScheduler } from '@/services/notificationScheduler';
import { useNotificationTapOpensHome } from '@/services/notifications';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StreakTabIcon } from '@/components/streak-tab-icon';
import { colors, fonts } from '@/constants/theme';

export default function TabLayout() {
  // Local notifications for the signed-in user: keep the schedule current, and open Home on a tap
  useEffect(() => startNotificationScheduler(), []);
  useNotificationTapOpensHome();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: 'Summary',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          // the icon reads the shared stats store itself, so a streak change never re-renders the navigator
          tabBarIcon: ({ color }) => <StreakTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
