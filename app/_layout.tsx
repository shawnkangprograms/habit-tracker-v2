import {useEffect} from 'react';
import {AppState} from 'react-native'; //AppState lets us detect when the app becomes active/background/inactive

import {initializeSchema} from '@/db/schema';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated'; 
import { useColorScheme } from '@/hooks/use-color-scheme';
import {syncCompletions} from '@/sync/syncEngine';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useEffect(() => {
    initializeSchema();
  },[]);

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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
