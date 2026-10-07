import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * React Native 0.86 can report 'unspecified' (and never null), so normalise to the two themes we define.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
