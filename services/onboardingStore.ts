import AsyncStorage from '@react-native-async-storage/async-storage';
import {createOnboardingStore} from '@/services/onboardingStoreCore';

// The app's onboarding record store (services/onboardingStoreCore.ts) on AsyncStorage. Creating it reads nothing.
export const onboardingStore = createOnboardingStore(AsyncStorage);
