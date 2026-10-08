import {useState, useEffect} from 'react'; // hooks for state management and lifecycle side effects (listeners, timers)
import {AppState} from 'react-native'; //AppState lets us detect when the app enters active/background/inactive state

import {getDatabase} from '@/db/database'; //opens the local db and runs migrations; resolves once it's ready
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router'; // theme definitions & ThemeProvider (since SDK 56 these come from expo-router, not @react-navigation/native) and Stack for stack based screen nav
import { StatusBar } from 'expo-status-bar'; // for controlling status bar appearance
import 'react-native-reanimated'; // side-effect import to initialize gesture and animation drivers for react navigation
import { useColorScheme } from '@/hooks/use-color-scheme'; //custom hook to read user's system dark/light mode
import {syncCompletions} from '@/sync/syncEngine'; //import data sync utility to keep local storage in sync with remote db
import {onAuthStateChanged} from 'firebase/auth'; //firebase auth state listener
import {getFirebaseAuth} from '@/services/authInit'; //helper fxn that returns the active firebase auth instance
import {ThemedText} from '@/components/themed-text';

// Sync is paused until build step 2: sync/push.js still uses the old sticky-true rule.
const SYNC_ENABLED = false;

// import config obj used by expo router to establish initial route anchoring
export const unstable_settings = {
  //Directs Expo Router deep-linking fallbacks to anchor on the '(tabs)' route group
  anchor: '(tabs)',
};

// Define and export the root layout component for the application
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
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
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
    })
    return () => unsubscribe();
  }, [])

  useEffect(() => { //a second, separate effect - this manages an ongoing subscription, not a one-time action
    if (!SYNC_ENABLED || !isLoggedIn) return; //don't set up the listener if sync is paused or not logged in

    const subscription = AppState.addEventListener('change', (nextAppState) => {
    //start listening for app state changes; nextAppState tells what state the app changed to

    if (nextAppState === 'active') {
      //only react when the app has just come to foreground (not background/inactive)
      syncCompletions(); //trigger a sync attempt
    }
  });
    return () => subscription.remove();
    //cleanup fxn: stops listening for app state changes if this component unmounts, preventing duplicate listeners
  }, [isLoggedIn]); //rerun this effect whenever isLoggedIn changes

  useEffect(() => {
    if (!SYNC_ENABLED || !isLoggedIn) return; //don't start the timer if sync is paused or not logged in

    const intervalId = setInterval(() => {
      syncCompletions(); 
    }, 5*60*1000);

    return () => clearInterval(intervalId);
  }, [isLoggedIn]); //rerun this effect whenever isLoggedIn changes

  // all hooks above run before any early return
  if (dbError) return <ThemedText>Couldn&apos;t open local data. Please restart the app.</ThemedText>;
  if (isLoggedIn === null || !dbReady) return null; //still checking auth state or opening the db, let splash screen linger

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
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
        </Stack.Protected>  

        <Stack.Protected guard={!isLoggedIn}>
          <Stack.Screen name="auth" options={{headerShown: false}} />
        </Stack.Protected>

        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
