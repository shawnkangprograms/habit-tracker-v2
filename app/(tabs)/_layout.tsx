import { useEffect, useSyncExternalStore } from 'react';
import { Tabs } from 'expo-router';
import { onboardingLaunch } from '@/services/onboardingLaunch';
import { startNotificationScheduler } from '@/services/notificationScheduler';
import { addTapOpensHomeListener } from '@/services/notifications';
import { homeUsable, startAfter } from '@/services/startupSignals';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StreakTabIcon } from '@/components/streak-tab-icon';
import { colors, fonts } from '@/constants/theme';
import { mark } from '@/utils/startupTrace';

mark('layout:tabsEvaluated');

// Notifications start after Home's first load, so loading expo-notifications and the first schedule rebuild
// never compete with it (the fallback covers a Home that never becomes usable)
const NOTIFICATIONS_AFTER_HOME_MS = 3 * 1000;
const NOTIFICATIONS_FALLBACK_MS = 8 * 1000;

const TAB_BAR_STYLE = { backgroundColor: colors.surface, borderTopColor: colors.border };
const TAB_BAR_HIDDEN = { display: 'none' } as const;

export default function TabLayout() {
  useEffect(() => mark('tabs:mount'), []);
  // Right after a sign-up, onboarding opens over a blank Home: no tab bar, even for a frame (services/onboardingLaunch.ts).
  // An in-memory read; false for every returning user.
  const launching = useSyncExternalStore(onboardingLaunch.subscribe, onboardingLaunch.isLaunchPending);

  // Local notifications for the signed-in user: keep the schedule current, and open Home on a tap.
  // Unmounting (sign-out) cancels a start that is still pending.
  useEffect(() => startAfter(homeUsable, () => {
    const stopScheduler = startNotificationScheduler();
    const removeTapListener = addTapOpensHomeListener();
    return () => {
      stopScheduler();
      removeTapListener();
    };
  }, {afterMs: NOTIFICATIONS_AFTER_HOME_MS, fallbackMs: NOTIFICATIONS_FALLBACK_MS}), []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: launching ? TAB_BAR_HIDDEN : TAB_BAR_STYLE,
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
