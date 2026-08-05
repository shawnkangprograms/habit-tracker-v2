import {useState, useEffect} from 'react';
import {AppState} from 'react-native'; //AppState lets us detect when the app becomes active/background/inactive

import {initializeSchema} from '@/db/schema';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated'; 
import { useColorScheme } from '@/hooks/use-color-scheme';
import {syncCompletions} from '@/sync/syncEngine';
import {onAuthStateChanged} from 'firebase/auth';
import {getFirebaseAuth} from '@/services/authInit';

export const unstable_settings = {
  anchor: '(tabs)',
};

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
  const subscription = AppState.addEventListener('change', (nextAppState) => {
    //start listening for app state changes; nextAppState tells what state the app changed to

    if (nextAppState === 'active') {
      //only react when the app has just come to foreground (not background/inactive)
      syncCompletions(); //trigger a sync attempt
    }
  });
    return () => subscription.remove();
    //cleanup fxn: stops listening for app state changes if this component unmounts, preventing duplicate listeners
  }, []); //empty array: set up this listener once, when the component first mounts  

  useEffect(() => {
    const intervalId = setInterval(() => {
      syncCompletions(); 
    }, 5*60*1000);

    return () => clearInterval(intervalId);
  }, []);

  if (isLoggedIn === null) return null; //still checking auth state, let splash screen linger

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* old line */}
        {/*<Stack.Screen name="(tabs)" options={{ headerShown: false }} />*/}
        
        {/* new updated */}
        {isLoggedIn ? (
          <Stack.Screen name="(tabs)" options={{headerShown: false}} />
        ) : (
          <Stack.Screen name="auth" options={{headerShown: false}} />
        )}

        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
