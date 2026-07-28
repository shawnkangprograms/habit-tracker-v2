import {ThemedView} from '@/components/themed-view';
import {ThemedText} from '@/components/themed-text';
import {SafeAreaView} from 'react-native-safe-area-context';

export default function SettingsScreen (){
    return(
        <SafeAreaView>
            <ThemedView>
              <ThemedText>Settings</ThemedText>
            </ThemedView>
        </SafeAreaView>
    )
}