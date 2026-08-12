import {ThemedView} from '@/components/themed-view';
import {ThemedText} from '@/components/themed-text';
import {SafeAreaView} from 'react-native-safe-area-context';

import {TouchableOpacity} from 'react-native';
import {signOut} from '@/services/authActions';

export default function SettingsScreen (){
    return(
        <SafeAreaView>
            <ThemedView>
              <ThemedText>Settings</ThemedText>
              <TouchableOpacity onPress={signOut}>
                <ThemedText>Sign Out</ThemedText>
              </TouchableOpacity>
            </ThemedView>
        </SafeAreaView>
    )
}