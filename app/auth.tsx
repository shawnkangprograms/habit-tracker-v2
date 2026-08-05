import {useState} from 'react';
import {TextInput} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ThemedText} from '@/components/themed-text';
import {ThemedView} from '@/components/themed-view';

export default function AuthScreen() {

        const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        age: '',
    });

    const [isSignUp, setIsSignUp] = useState(true); //true - sign up false - sign in

    return (
    <SafeAreaView>
        <ThemedView> {/* the screen's outer container */}
        <ThemedText>Auth</ThemedText> {/*Simple, temporary heading until we build proper UI */}
            <TextInput
        value={formData.email}
        onChangeText={(text) => setFormData({ ...formData, email: text})}
        />

        <TextInput
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text})}
        />

        <TextInput
            value={formData.firstName}
            onChangeText={(text) => setFormData({ ...formData, firstName: text})}
        />

        <TextInput
            value={formData.lastName}
            onChangeText={(text) => setFormData({ ...formData, lastName: text})}
        />

        <TextInput
            value={formData.age}
            onChangeText={(text) => setFormData({ ...formData, age: text})}
        />

        </ThemedView>
    </SafeAreaView>  
    );
};

