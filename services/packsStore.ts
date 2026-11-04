import AsyncStorage from '@react-native-async-storage/async-storage';
import {createPacksStore} from '@/services/packsStoreCore';

// The app's pack record store (services/packsStoreCore.ts) on AsyncStorage. Creating it reads nothing.
export const packsStore = createPacksStore(AsyncStorage);
