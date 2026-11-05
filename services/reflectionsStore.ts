import AsyncStorage from '@react-native-async-storage/async-storage';
import {createReflectionsStore} from '@/services/reflectionsStoreCore';

// The app's reflection store (services/reflectionsStoreCore.ts) on AsyncStorage. Creating it reads nothing.
export const reflectionsStore = createReflectionsStore(AsyncStorage);
