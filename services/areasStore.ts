import AsyncStorage from '@react-native-async-storage/async-storage';
import {createAreasStore} from '@/services/areasStoreCore';

// The app's radar area store (services/areasStoreCore.ts) on AsyncStorage. Creating it reads nothing.
export const areasStore = createAreasStore(AsyncStorage);
