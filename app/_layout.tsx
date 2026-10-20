import {useState, useEffect} from 'react'; // hooks for state management and lifecycle side effects (listeners, timers)
import {AppState} from 'react-native'; //AppState lets us detect when the app enters active/background/inactive state

import {getDatabase} from '@/db/database'; //opens the local db and runs migrations; resolves once it's ready
import { DarkTheme, ThemeProvider, Stack } from 'expo-router'; // theme definitions & ThemeProvider (since SDK 56 these come from expo-router, not @react-navigation/native) and Stack for stack based screen nav
import { StatusBar } from 'expo-status-bar'; // for controlling status bar appearance
import 'react-native-reanimated'; // side-effect import to initialize gesture and animation drivers for react navigation
import {useFonts} from 'expo-font'; //loads font files; returns [loaded, error]
import {SpaceGrotesk_700Bold} from '@expo-google-fonts/space-grotesk';
import {Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold} from '@expo-google-fonts/inter';
import {colors} from '@/constants/theme';
import {notifyLocalChange, requestSync, startSync, stopSync} from '@/sync/syncEngine'; //push engine: local changes -> Firestore
import {onLocalChange} from '@/db/localChanges'; //committed user changes, so sync can push soon after
import {onAuthStateChanged} from 'firebase/auth'; //firebase auth state listener
import {getFirebaseAuth} from '@/services/authInit'; //helper fxn that returns the active firebase auth instance
import {ThemedText} from '@/components/themed-text';
import {AdminContext, useAdminCheck} from '@/services/adminContext'; //admins/{uid} check, filled in after first render
import {useDisabledCheck} from '@/services/useDisabledCheck'; //signs out a disabled account; never blocks startup

// The app is dark-only: navigation colours come from the design tokens
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

// Kill switch for cloud sync (build stage 3: push only). false = no sync at all.
const SYNC_ENABLED = true;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

// import config obj used by expo router to establish initial route anchoring
export const unstable_settings = {
  //Directs Expo Router deep-linking fallbacks to anchor on the '(tabs)' route group
  anchor: '(tabs)',
};

// Define and export the root layout component for the application
export default function RootLayout() {
  // font keys match the family names in constants/theme.ts (fonts)
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const fontsReady = fontsLoaded || !!fontError; //on error, fall back to system fonts so the gate can never hang
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [uid, setUid] = useState<string | null>(null); //signed-in user's id; a new uid re-runs the admin check
  const admin = useAdminCheck(uid); //not part of the readiness gate below: isAdmin starts false and fills in later
  useDisabledCheck(uid); //on sign-in, launch and foreground; offline or unknown never signs anyone out
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(false);

  useEffect(() => { //open the db and run migrations before any screen can query it
    getDatabase()
      .then(() => setDbReady(true))
      .catch((err: unknown) => {
        console.log('Local database setup failed', err);
        setDbError(true);
      });
  },[]);

  useEffect(() => {
    if (fontError) console.warn('Font loading failed, using system fonts', fontError);
  }, [fontError]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
      setUid(user?.uid ?? null);
    })
    return () => unsubscribe();
  }, [])

  // Sync for the signed-in user: one effect keyed on uid owns every trigger. Sign-in (or launch with a
  // saved session) starts it with an immediate push; sign-out or a different uid tears everything down
  // first, so strict-mode double effects or a fast sign-out/sign-in can't leave a second timer or listener.
  useEffect(() => {
    if (!SYNC_ENABLED || !uid) return;

    startSync(uid);
    const unsubscribeLocal = onLocalChange(notifyLocalChange); //push ~3 s after the last committed change
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') requestSync(); //back in the foreground
    });
    const intervalId = setInterval(() => { requestSync(); }, SYNC_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      appStateSub.remove();
      unsubscribeLocal();
      stopSync(); //a running cycle ends at its next check
    };
  }, [uid]);

  // all hooks above run before any early return
  if (dbError) return <ThemedText>Couldn&apos;t open local data. Please restart the app.</ThemedText>;
  if (isLoggedIn === null || !dbReady || !fontsReady) return null; //still checking auth state, opening the db or loading fonts, let splash screen linger

  return (
    <AdminContext.Provider value={admin}>
    <ThemeProvider value={navTheme}>
      <Stack screenOptions={{contentStyle: {backgroundColor: colors.background}}}>
        {/* old line */}
        {/*<Stack.Screen name="(tabs)" options={{ headerShown: false }} />*/}

        {/* new updated */}
        {/*
        {isLoggedIn ? (
          <Stack.Screen name="(tabs)" options={{headerShown: false}} />
        ) : (
          <Stack.Screen name="auth" options={{headerShown: false}} />
        )}
        */}

        {/* update v2 */}
        {/* Protected routes: both screens are always declared, but only one is reachable at a time based on login state*/}
        <Stack.Protected guard={isLoggedIn}>
          <Stack.Screen name="(tabs)" options={{headerShown: false}} />
          <Stack.Screen name="habit-form" options={{headerShown: false}} />
        </Stack.Protected>

        {/* admin screens: reachable only while signed in AND the admins/{uid} check said yes; Firestore rules are the real guard */}
        <Stack.Protected guard={!!isLoggedIn && admin.isAdmin}>
          <Stack.Screen name="admin/overview" options={{headerShown: false}} />
          <Stack.Screen name="admin/users" options={{headerShown: false}} />
          <Stack.Screen name="admin/catalog" options={{headerShown: false}} />
          <Stack.Screen name="admin/catalog-form" options={{headerShown: false}} />
          <Stack.Screen name="admin/audit" options={{headerShown: false}} />
          <Stack.Screen name="admin/user" options={{headerShown: false}} />
        </Stack.Protected>

        <Stack.Protected guard={!isLoggedIn}>
          <Stack.Screen name="auth" options={{headerShown: false}} />
        </Stack.Protected>

        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
    </AdminContext.Provider>
  );
}
