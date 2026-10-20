import {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type KeyboardTypeOptions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {resetPassword, signUp, signIn} from '@/services/authActions';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {validateAge, validateConfirmPassword, validateEmail, validatePassword} from '@/validation/validators';

type Field = 'email' | 'password' | 'confirmPassword' | 'age';
type FieldErrors = Partial<Record<Field, string>>;
type Mode = 'signUp' | 'signIn' | 'reset';

const RESEND_COOLDOWN_MS = 30 * 1000; // limits repeat reset emails

function authErrorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
}

// Firebase error codes -> messages for the user. Raw Firebase text is never shown.
function friendlyAuthError(err: unknown): string {
  switch (authErrorCode(err)) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Please choose a stronger password.';
    case 'auth/network-request-failed':
      return "Couldn't connect. Check your internet connection and try again.";
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

// One pill input with a leading icon, styled like the inputs in habit-form.tsx
function AuthInput(props: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  error?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  textContentType?: 'emailAddress' | 'password' | 'newPassword' | 'none';
  editable: boolean;
}) {
  const isEmail = props.textContentType === 'emailAddress';
  return (
    <View style={styles.field}>
      <View style={[styles.input, props.error && styles.inputError]}>
        <MaterialCommunityIcons name={props.icon} size={20} color={colors.muted} />
        <TextInput
          style={styles.inputInner}
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.placeholder}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          secureTextEntry={props.secure}
          keyboardType={props.keyboardType}
          textContentType={props.textContentType}
          autoComplete={isEmail ? 'email' : props.textContentType === 'none' ? 'off' : props.secure ? 'password' : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          editable={props.editable}
          returnKeyType="done"
        />
      </View>
      {props.error ? <Text style={styles.errorText}>{props.error}</Text> : null}
    </View>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signUp');
  const isSignUp = mode === 'signUp';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [age, setAge] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false); // drives the button's loading state
  const submittingRef = useRef(false); // a ref, not state, so a second tap in the same frame is ignored
  const [resetSent, setResetSent] = useState(false); // shows the reset confirmation
  const [resendAvailableAt, setResendAvailableAt] = useState(0); // ms timestamp; the reset button is disabled until then
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));
  const coolingDown = secondsLeft > 0;

  // ticks the resend countdown; the interval is cleared when it ends or the screen unmounts
  useEffect(() => {
    if (resendAvailableAt <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= resendAvailableAt) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [resendAvailableAt]);

  // typing in a field clears that field's message and the Firebase message above the button
  const edit = (field: Field, setter: (text: string) => void) => (text: string) => {
    setter(text);
    setErrors((e) => ({...e, [field]: undefined}));
    setSubmitError('');
    setResetSent(false);
  };

  // the email is kept across modes; everything else is cleared
  const goToMode = (next: Mode) => {
    if (submittingRef.current) return;
    setMode(next);
    setPassword('');
    setConfirmPassword('');
    setErrors({});
    setSubmitError('');
    setResetSent(false);
  };

  const handleReset = async () => {
    if (submittingRef.current || coolingDown) return; // ignore extra taps while sending or during the countdown
    setSubmitError('');
    setResetSent(false);

    const emailResult = validateEmail(email);
    setErrors({email: emailResult.valid ? undefined : emailResult.error});
    if (!emailResult.valid) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await resetPassword(emailResult.value);
      // the same confirmation whether or not an account exists
      setResetSent(true);
      const t = Date.now();
      setNow(t);
      setResendAvailableAt(t + RESEND_COOLDOWN_MS);
    } catch (err) {
      if (authErrorCode(err) === 'auth/invalid-email') {
        setErrors({email: friendlyAuthError(err)});
      } else {
        setSubmitError(friendlyAuthError(err)); // network, too-many-requests or the generic message; no countdown
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return; // ignore extra taps while a request is running
    setSubmitError('');

    // every field is validated so each can show its own message at once
    const emailResult = validateEmail(email);
    // the password is never trimmed; sign in only needs it non-empty (the 8-character rule is for new passwords)
    const passwordResult = isSignUp
      ? validatePassword(password)
      : password.length > 0 ? {valid: true as const, value: password} : {valid: false as const, error: "Password can't be empty."};
    const confirmResult = isSignUp ? validateConfirmPassword(password, confirmPassword) : null;
    const ageResult = isSignUp ? validateAge(age) : null;
    setErrors({
      email: emailResult.valid ? undefined : emailResult.error,
      password: passwordResult.valid ? undefined : passwordResult.error,
      confirmPassword: confirmResult && !confirmResult.valid ? confirmResult.error : undefined,
      age: ageResult && !ageResult.valid ? ageResult.error : undefined,
    });
    if (!emailResult.valid || !passwordResult.valid) return;
    // the age gate: checked before createUserWithEmailAndPassword, so no under-18 account is ever created
    const ageValue = ageResult?.valid ? ageResult.value : null;
    if (isSignUp && (!confirmResult?.valid || ageValue === null)) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (isSignUp && ageValue !== null) {
        await signUp(emailResult.value, passwordResult.value, ageValue);
      } else {
        await signIn(emailResult.value, passwordResult.value);
      }
      // on success onAuthStateChanged in app/_layout.tsx swaps this screen for the tabs
    } catch (err) {
      if (authErrorCode(err) === 'profile-write-failed') {
        // this screen has usually unmounted by now (sign-in swapped it for the tabs), so the message goes in an Alert
        Alert.alert("Couldn't create your account", 'Please check your internet connection and try again.');
      }
      setSubmitError(friendlyAuthError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const isReset = mode === 'reset';
  const buttonDisabled = submitting || (isReset && coolingDown);
  const buttonLabel = isReset
    ? (coolingDown ? `Resend in ${secondsLeft}s` : 'Send reset link')
    : (isSignUp ? 'Create Account' : 'Sign In');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* iOS: padding lifts the content above the keyboard. Android: the window resizes, so no behaviour is set */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <MaterialCommunityIcons name="fire" size={24} color={colors.accent} />
            </View>
            <Text style={styles.title}>HabitQuest</Text>
            <Text style={styles.tagline}>BUILD HABITS. BECOME LEGENDARY.</Text>
          </View>

          {isReset && (
            <View style={styles.resetIntro}>
              <Text style={styles.resetTitle}>Reset your password</Text>
              <Text style={styles.resetBody}>Enter your account email and we&apos;ll send you a reset link.</Text>
            </View>
          )}

          <AuthInput
            icon="email-outline"
            value={email}
            onChangeText={edit('email', setEmail)}
            placeholder="Email address"
            error={errors.email}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!submitting}
          />
          {!isReset && (
            <AuthInput
              icon="lock-outline"
              value={password}
              onChangeText={edit('password', setPassword)}
              placeholder="Password"
              error={errors.password}
              secure
              textContentType={isSignUp ? 'newPassword' : 'password'}
              editable={!submitting}
            />
          )}
          {mode === 'signIn' && (
            <Pressable
              style={styles.forgotRow}
              onPress={() => goToMode('reset')}
              disabled={submitting}
              hitSlop={8}
              accessibilityRole="button">
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          )}
          {isSignUp && (
            <>
              <AuthInput
                icon="shield-check-outline"
                value={confirmPassword}
                onChangeText={edit('confirmPassword', setConfirmPassword)}
                placeholder="Confirm password"
                error={errors.confirmPassword}
                secure
                textContentType="newPassword"
                editable={!submitting}
              />
              <AuthInput
                icon="calendar-account-outline"
                value={age}
                onChangeText={edit('age', setAge)}
                placeholder="Age"
                error={errors.age}
                keyboardType="number-pad"
                textContentType="none"
                editable={!submitting}
              />
            </>
          )}

          {isReset && resetSent ? (
            <Text style={styles.confirmText}>
              If an account exists for that email, we&apos;ve sent a reset link. Check your spam folder too.
            </Text>
          ) : null}
          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

          <Pressable
            style={({pressed}) => [styles.primaryButton, (pressed || buttonDisabled) && styles.pressed]}
            onPress={isReset ? handleReset : handleSubmit}
            disabled={buttonDisabled}
            accessibilityRole="button"
            accessibilityState={{busy: submitting, disabled: buttonDisabled}}>
            {submitting
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.primaryText}>{buttonLabel}</Text>}
          </Pressable>

          {isReset ? (
            <Pressable style={styles.switchRow} onPress={() => goToMode('signIn')} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.switchText, styles.switchAction]}>Back to sign in</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.switchRow}
              onPress={() => goToMode(isSignUp ? 'signIn' : 'signUp')}
              hitSlop={8}
              accessibilityRole="button">
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account?  ' : 'New to HabitQuest?  '}
                <Text style={styles.switchAction}>{isSignUp ? 'Sign in' : 'Create an account'}</Text>
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  flex: {flex: 1},
  content: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl},
  header: {alignItems: 'center', marginBottom: spacing.xxl},
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.iconBadge,
    backgroundColor: colors.accent + '26', // ~15% opacity
    borderWidth: 1,
    borderColor: colors.accent + '66', // ~40% opacity
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontFamily: fonts.title, fontSize: 30, color: colors.text, marginTop: spacing.lg},
  tagline: {fontFamily: fonts.regular, fontSize: 11, letterSpacing: 0.6, color: colors.muted, marginTop: spacing.md},
  field: {marginBottom: spacing.md},
  input: {
    height: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  inputError: {borderColor: colors.error},
  inputInner: {flex: 1, height: '100%', fontFamily: fonts.regular, fontSize: 14, color: colors.text},
  errorText: {fontFamily: fonts.medium, fontSize: 12, color: colors.error, marginTop: spacing.sm, marginLeft: 20},
  submitError: {fontFamily: fonts.medium, fontSize: 13, color: colors.error, textAlign: 'center', marginTop: spacing.xs},
  confirmText: {fontFamily: fonts.medium, fontSize: 13, color: colors.green, textAlign: 'center', marginTop: spacing.xs},
  forgotRow: {alignSelf: 'flex-end', marginRight: 20, marginBottom: spacing.md},
  forgotText: {fontFamily: fonts.medium, fontSize: 13, color: colors.muted},
  resetIntro: {alignItems: 'center', marginBottom: spacing.lg},
  resetTitle: {fontFamily: fonts.title, fontSize: 20, color: colors.text},
  resetBody: {fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: spacing.sm},
  primaryButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
  pressed: {opacity: 0.85},
  switchRow: {alignSelf: 'center', marginTop: spacing.lg},
  switchText: {fontFamily: fonts.regular, fontSize: 13, color: colors.muted},
  switchAction: {fontFamily: fonts.medium, color: colors.text},
});
