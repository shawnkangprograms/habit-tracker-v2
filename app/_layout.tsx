import {mark} from '@/utils/startupTrace'; // FIRST import: its evaluation is the trace's "first import" mark (preview build only)
import {useState, useEffect, useCallback, useRef} from 'react'; // hooks for state management and lifecycle side effects (listeners, timers)
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
import * as SystemUI from 'expo-system-ui'; //root view background, behind every screen
import {reset as resetStatsStore} from '@/services/statsStore'; //shared stats for Profile and its tab icon
import {startTraceCapture} from '@/services/startupTraceStore'; //saves the startup trace (preview build only)
import {homeUsable, startAfter} from '@/services/startupSignals'; //starts network work after Home's first load
import {startOtaUpdateCheck} from '@/services/otaUpdates'; //over-the-air update check, 10 s after Home is usable
import {clearMarker, readMarker, writeMarker} from '@/services/authMarker'; //the uid Firebase last confirmed on this phone
import {setSessionUid} from '@/services/session'; //the uid screens show local data for
import {
  confirmedUid, INITIAL_SESSION, nextSession, sessionKnown, shownUid, type AuthEvent, type AuthSession,
} from '@/utils/authSession'; //unknown / presumed / confirmed (fix #1: the splash never waits for Firebase's network check)

mark('layout:rootEvaluated'); // every import above has been evaluated
startTraceCapture(); // a no-op unless EXPO_PUBLIC_STARTUP_TRACE=1

// Root view background behind every screen: dark, so nothing white shows during Android transitions
SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});

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
// Sync and the admin and disabled checks (the first users of Firestore, which loads on first use) start once
// Home is usable, or this long after sign-in / launch if Home never gets there
const SERVICES_FALLBACK_MS = 5 * 1000;

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
  // Who the screens show local data for: presumed from the sign-in marker, then confirmed (or not) by Firebase.
  // See utils/authSession.ts. The ref is the same state, read synchronously by applyAuthEvent.
  const [session, setSession] = useState<AuthSession>(INITIAL_SESSION);
  const sessionRef = useRef<AuthSession>(INITIAL_SESSION);
  const [stackKey, setStackKey] = useState(0); //bumped when one uid replaces another directly, so every screen remounts
  const isLoggedIn = shownUid(session) !== null;
  // Network work waits for Firebase's own answer: a presumed uid never starts sync or the admin/disabled checks
  const uid = confirmedUid(session);
  // The uid the network services run for: the confirmed uid once its start time has come (see startAfter below),
  // otherwise null. Compared with uid on every render, so sign-out or a different user stops them in that same
  // render; a previous user's uid is never used.
  const [servicesStartedFor, setServicesStartedFor] = useState<string | null>(null);
  const servicesUid = uid !== null && servicesStartedFor === uid ? uid : null;
  const admin = useAdminCheck(servicesUid); //not part of the readiness gate below: isAdmin starts false and fills in later
  useDisabledCheck(servicesUid); //on sign-in, launch and foreground; offline or unknown never signs anyone out
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(false);

  useEffect(() => { //open the db and run migrations before any screen can query it
    mark('root:firstCommit');
    getDatabase()
      .then(() => {
        mark('db:ready');
        setDbReady(true);
      })
      .catch((err: unknown) => {
        console.log('Local database setup failed', err);
        setDbError(true);
      });
  },[]);

  useEffect(() => startOtaUpdateCheck(), []); //downloads only; a new update runs from the next cold start

  useEffect(() => {
    if (fontError) console.warn('Font loading failed, using system fonts', fontError);
  }, [fontError]);

  useEffect(() => {
    if (fontsReady) mark('fonts:ready');
  }, [fontsReady]);

  const gateOpen = sessionKnown(session) && dbReady && fontsReady; //same condition as the early return below
  useEffect(() => {
    if (gateOpen) mark('gate:open');
  }, [gateOpen]);

  // Every marker read and auth callback goes through here. The stats store and the session uid change BEFORE any
  // screen renders for the new uid, so no one sees another account's streak or habits.
  const applyAuthEvent = useCallback((event: AuthEvent) => {
    const before = sessionRef.current;
    const next = nextSession(before, event);
    if (next === before) return;
    sessionRef.current = next;
    const fromUid = shownUid(before);
    const toUid = shownUid(next);
    resetStatsStore(toUid);
    setSessionUid(toUid);
    if (fromUid !== null && toUid !== null && fromUid !== toUid) setStackKey((k) => k + 1);
    setSession(next);
    if (next.kind === 'presumed') mark('auth:presumed');
  }, []);

  useEffect(() => {
    let active = true;
    readMarker().then((markerUid) => { //started before Firebase's own restore, both read AsyncStorage
      if (!active) return;
      mark('auth:markerRead');
      applyAuthEvent({type: 'markerRead', uid: markerUid});
    });
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      mark('auth:firstCallback'); //first call only (later ones are no-ops)
      if (user) writeMarker(user.uid); //confirmed: the next launch may presume this uid
      else clearMarker().catch((err: unknown) => console.log('Clearing the sign-in marker failed', err));
      applyAuthEvent({type: 'callback', uid: user?.uid ?? null});
    })
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyAuthEvent])

  // Network services wait for Home's first load. Unmount, sign-out or another uid cancels a pending start.
  useEffect(() => {
    if (!uid) return;
    return startAfter(homeUsable, () => {
      mark('services:start');
      setServicesStartedFor(uid);
    }, {afterMs: 0, fallbackMs: SERVICES_FALLBACK_MS});
  }, [uid]);

  // Sync for the signed-in user: one effect keyed on the services uid owns every trigger. Its start (above)
  // runs a cycle at once; sign-out or a different uid tears everything down first, so strict-mode double
  // effects or a fast sign-out/sign-in can't leave a second timer or listener.
  useEffect(() => {
    if (!SYNC_ENABLED || !servicesUid) return;

    startSync(servicesUid);
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
  }, [servicesUid]);

  // all hooks above run before any early return
  if (dbError) return <ThemedText>Couldn&apos;t open local data. Please restart the app.</ThemedText>;
  if (!gateOpen) return null; //no marker and no auth answer yet, opening the db or loading fonts, let splash screen linger

  return (
    <AdminContext.Provider value={admin}>
    <ThemeProvider value={navTheme}>
      <Stack key={stackKey} screenOptions={{contentStyle: {backgroundColor: colors.background}}}>
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
