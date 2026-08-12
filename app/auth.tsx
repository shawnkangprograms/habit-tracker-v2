import {useState} from 'react';
import {TextInput, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ThemedText} from '@/components/themed-text';
import {ThemedView} from '@/components/themed-view';
import {signUp, signIn} from '@/services/authActions';

export default function AuthScreen() {

        const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        age: '',
    });

    const [error, setError] = useState('');

    const [isSignUp, setIsSignUp] = useState(true); //true - sign up false - sign in

    const inputStyle = {borderWidth: 1, borderColor: 'gray', padding: 8, marginBottom: 8};

    const handleSubmit = async () => { 
        //1. clear any previous errors when the user tries again
        setError('');

        //2. basic validation for both modes
        if (!formData.email || !formData.password) {
            setError('Email and password are required.');
            return; //stop execution
        }

        //3. Extra validation for sign up
        if (isSignUp && (!formData.firstName || !formData.lastName || !formData.age)){
            setError('Please fill out all fields to create an account')
            return; //stop execution
        }

        //4. The actual submission (wrapped in try/catch for future API calls)
        try{
            if (isSignUp) {
            /* Old sign up branch

            //sign-up logic will need all the form data
            console.log("Routing to sign up with:", formData);
            // TODO: call backend signUp(formData.email, formData.password, ...)
            */

            //new sign-up branch
            await signUp(formData.email, formData.password, formData.firstName, formData.lastName, formData.age);
            
            } else {
                /* Old sign in branch - submitting only logs to console; no account gets created,
                no Firestore doc is written, nothing gets written to Firebase at all 

                //sign-in logic only needs email and password
                console.log("Routing to sign in with:", {
                    email: formData.email,
                    password: formData.password
                });
                // TODO: call backend signIn(formData.email, formData.password)

                */

                // new sign in branch
                await signIn(formData.email, formData.password);
            }

        /* 
            Old try catch which had 'err' is of type unkown error
        } catch (err) {
            // catch and display any errors from backend later
            setError(err.message || 'An error occurred during authentication.');
        }
        */    

        } catch (err) {
            //check if error is a standard Error object
            if (err instanceof Error) {
                setError(err.message);
            } else {
                //fallback for weird edge cases
                setError('An error occurred during authentication.');
            }
        }
    };
    
    /* WRONG: combines &&, a ternary, and placeholder text all at once, and it's placed outside the return, floating on its own with no effect on anything. 
        It also references firstName, lastname, age as if they were variables — they're not; they're just keys inside formData.  
    
        isSignUp && (...) ? (firstName, lastname, age) : (null)
    
    */

    return (
    <SafeAreaView>
        {/* the screen's outer container */}
        <ThemedView>

        {/*Simple, temporary heading until we build proper UI */}
        <ThemedText>Auth</ThemedText> 
            <TextInput
        value={formData.email}
        style={inputStyle}
        onChangeText={(text) => setFormData({ ...formData, email: text})}
        />

        <TextInput
            value={formData.password}
            style={inputStyle}
            secureTextEntry
            onChangeText={(text) => setFormData({ ...formData, password: text})}
        />

        {isSignUp &&(
         <> 

            <TextInput
                value={formData.firstName}
                style={inputStyle}
                onChangeText={(text) => setFormData({ ...formData, firstName: text})}
            />

            <TextInput
                value={formData.lastName}
                style={inputStyle}
                onChangeText={(text) => setFormData({ ...formData, lastName: text})}
            />

            <TextInput
                value={formData.age}
                style={inputStyle}
                onChangeText={(text) => setFormData({ ...formData, age: text})}
            />
            
            {/* ThemedText not needed now coz I can confirm typing through the bordered input fields

            <ThemedText>{formData.firstName}</ThemedText>
            <ThemedText>{formData.lastName}</ThemedText>
            <ThemedText>{formData.age}</ThemedText>
            */}
         </>
        )} 

        {/*Render the error message if there's one*/}
        {error ? (
            <ThemedText style={{color:'red', marginBottom: 12, textAlign: 'center'}}>
                {error}
            </ThemedText>
        ) : null}

        <TouchableOpacity
            style={{backgroundColor: 'blue', padding: 12, marginBottom: 16, alignItems: 'center'}}
            onPress={handleSubmit}
        >
            <ThemedText style={{color: 'white', fontWeight: 'bold'}}>
                {isSignUp ? "Create Account" : "Sign In"}    
            </ThemedText>    
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
            <ThemedText>
                {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </ThemedText>
        </TouchableOpacity>

        </ThemedView>
    </SafeAreaView>  
    );
};

