import AsyncStorage from '@react-native-async-storage/async-storage';
import {createOutlineStore} from '@/services/profileOutlineStoreCore';

// The app's starting-outline store (services/profileOutlineStoreCore.ts) on AsyncStorage. Creating it reads nothing.
export const profileOutlineStore = createOutlineStore(AsyncStorage);
