import {useState, useEffect} from 'react'; // hooks for state management and lifecycle side effects (listeners, timers)
import {AppState} from 'react-native'; //AppState lets us detect when the app enters active/background/inactive state

import {initializeSchema} from '@/db/schema'; //import db schema initialization fxn from local db module
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'; // theme definintions & ThemeProvider from react navigation for styling
import { Stack } from 'expo-router'; //import stack component for stack based screen nav
import { StatusBar } from 'expo-status-bar'; // for controlling status bar appearance
import 'react-native-reanimated'; // side-effect import to initialize gesture and animation drivers for react navigation
import { useColorScheme } from '@/hooks/use-color-scheme'; //custom hook to read user's system dark/light mode
import {syncCompletions} from '@/sync/syncEngine'; //import data sync utility to keep local storage in sync with remote db
import {onAuthStateChanged} from 'firebase/auth'; //firebase auth state listener
import {getFirebaseAuth} from '@/services/authInit'; //helper fxn that returns the active firebase auth instance

// import config obj used by expo router to establish initial route anchoring
export const unstable_settings = {
  //Directs Expo Router deep-linking fallbacks to anchor on the '(tabs)' route group
  anchor: '(tabs)',
};

// Define and export the root layout component for the application
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    initializeSchema();
  },[]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
    })
    return () => unsubscribe();
  }, [])

  useEffect(() => { //a second, separate effect - this manages an ongoing subscription, not a one-time action
    if (!isLoggedIn) return; //don't set up the listener if not logged in

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
    if (!isLoggedIn) return; //don't start the  timer is not logged in

    const intervalId = setInterval(() => {
      syncCompletions(); 
    }, 5*60*1000);

    return () => clearInterval(intervalId);
  }, [isLoggedIn]); //rerun this effect whenever isLoggedIn changes

  if (isLoggedIn === null) return null; //still checking auth state, let splash screen linger

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
