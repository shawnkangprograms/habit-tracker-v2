import {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect} from 'expo-router';

import {signOut} from '@/services/authActions';
import {profileCompletion, profileSetupScreen} from '@/services/profileCompletion';
import {profileNameStore} from '@/services/profileName';
import {useSessionUid} from '@/services/session';
import {useKeyboardScroll} from '@/hooks/use-keyboard-scroll';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {FIRST_NAME_LABEL, LAST_NAME_LABEL, visibleError} from '@/utils/profileName';
import {
  SETUP_AGE_LABEL, SETUP_BODY, SETUP_FAILED, SETUP_SAVE, SETUP_TITLE, setupAgeOutcome,
} from '@/utils/profilePending';
import {PERSON_NAME_MAX, validateAge, validatePersonName} from '@/validation/validators';

// "Finish setting up your account" (the orphan-account fix, docs/HABITQUEST_DESIGN.md): opened by
// services/useDisabledCheck.ts only when the server says this account has no users/{uid} profile and nothing on this
// phone can complete it. It blocks: no back row, swipe-back off (app/_layout.tsx) and Android Back does nothing.
// Age, first and last name use the sign-up form's validators. Saving needs the network; on success the screen closes.
// Under 18: the existing sign-up message, nothing is written, and the user is signed out (never a deletion).

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ProfileSetupScreen() {
  const uid = useSessionUid();
  const {padding: keyboardPad, scrollRef, innerRef, onScroll: onKeyboardScroll, onLayout: onKeyboardLayout, reveal: revealField} =
    useKeyboardScroll('content');// Android: keeps the focused field and Save reachable above the keyboard
  const [age, setAge] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [touched, setTouched] = useState({age: false, first: false, last: false});
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const savingRef = useRef(false);// a ref, not only state, so a second tap in the same frame is ignored

  useEffect(() => {
    profileSetupScreen.setOpen(true);
    return () => profileSetupScreen.setOpen(false);
  }, []);

  // Android hardware Back: nothing (the details are needed to keep using the app)
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []));

  const ageResult = validateAge(age);
  const ageOutcome = setupAgeOutcome(age);
  const first = validatePersonName(firstName, 'first');
  const last = validatePersonName(lastName, 'last');
  // Save stays enabled for an age under 18, so tapping it can say so and sign out
  const canSave = first.valid && last.valid && ageOutcome.kind !== 'invalid' && status !== 'saving';

  const save = async () => {
    setTouched({age: true, first: true, last: true});
    if (savingRef.current || !uid || !first.valid || !last.valid) return;
    if (ageOutcome.kind === 'invalid') return;
    if (ageOutcome.kind === 'underAge') {
      // nothing is written; the account is never deleted on this path
      await signOut().catch((err: unknown) => console.log('Sign-out failed', err));
      Alert.alert(ageOutcome.message);
      return;
    }
    savingRef.current = true;
    setStatus('saving');
    try {
      const profile = {age: ageOutcome.age, firstName: first.value, lastName: last.value};
      // through the completer: it reads the server first, so a profile made meanwhile elsewhere counts as done
      await profileCompletion.savePending(uid, profile);
      const result = await profileCompletion.complete(uid);
      if (result !== 'done') {
        setStatus('failed');
        return;
      }
      await profileNameStore.set({uid, firstName: first.value, lastName: last.value});
      close();
    } finally {
      savingRef.current = false;
      setStatus((s) => (s === 'saving' ? 'idle' : s));
    }
  };

  const edit = (setter: (text: string) => void) => (text: string) => {
    setter(text);
    if (status === 'failed') setStatus('idle');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* iOS: padding lifts the content above the keyboard. Android: edge-to-edge, so the window doesn't resize;
          the keyboard's height is added to the content instead (hooks/use-keyboard-scroll.ts) */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          innerViewRef={innerRef}
          onScroll={onKeyboardScroll}
          scrollEventThrottle={16}
          onLayout={onKeyboardLayout}
          contentContainerStyle={[styles.content, {paddingBottom: spacing.xl + keyboardPad}]}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title} accessibilityRole="header">{SETUP_TITLE}</Text>
          <Text style={styles.body}>{SETUP_BODY}</Text>

          <Field
            label={SETUP_AGE_LABEL}
            value={age}
            onChangeText={edit(setAge)}
            onBlur={() => setTouched((t) => ({...t, age: true}))}
            onFocus={revealField}
            error={visibleError(ageResult, touched.age)}
            keyboardType="number-pad"
            maxLength={3}
            editable={status !== 'saving'}
          />
          <Field
            label={FIRST_NAME_LABEL}
            value={firstName}
            onChangeText={edit(setFirstName)}
            onBlur={() => setTouched((t) => ({...t, first: true}))}
            onFocus={revealField}
            error={visibleError(first, touched.first)}
            autoComplete="name-given"
            textContentType="givenName"
            maxLength={PERSON_NAME_MAX * 2}// room for trimming; validatePersonName is the real limit
            editable={status !== 'saving'}
          />
          <Field
            label={LAST_NAME_LABEL}
            value={lastName}
            onChangeText={edit(setLastName)}
            onBlur={() => setTouched((t) => ({...t, last: true}))}
            onFocus={revealField}
            error={visibleError(last, touched.last)}
            autoComplete="name-family"
            textContentType="familyName"
            maxLength={PERSON_NAME_MAX * 2}
            editable={status !== 'saving'}
          />

          {status === 'failed' && <Text style={styles.failed} accessibilityLiveRegion="polite">{SETUP_FAILED}</Text>}

          <Pressable
            style={({pressed}) => [styles.save, (!canSave || pressed) && styles.saveOff]}
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{disabled: !canSave, busy: status === 'saving'}}>
            {status === 'saving'
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.saveText}>{SETUP_SAVE}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  onFocus: () => void;
  error: string | undefined;
  maxLength: number;
  editable: boolean;
  keyboardType?: 'number-pad';
  autoComplete?: 'name-given' | 'name-family';
  textContentType?: 'givenName' | 'familyName';
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{props.label.toUpperCase()}</Text>
      <TextInput
        style={[styles.input, props.error && styles.inputError]}
        value={props.value}
        onChangeText={props.onChangeText}
        onBlur={props.onBlur}
        onFocus={props.onFocus}
        accessibilityLabel={props.label}
        keyboardType={props.keyboardType}
        autoComplete={props.autoComplete}
        textContentType={props.textContentType}
        autoCapitalize={props.keyboardType ? 'none' : 'words'}
        autoCorrect={false}
        maxLength={props.maxLength}
        editable={props.editable}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        returnKeyType="done"
      />
      {props.error ? <Text style={styles.errorText}>{props.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  flex: {flex: 1},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.xl},
  body: {fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: spacing.md},
  section: {marginTop: spacing.xl, gap: spacing.sm},
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted},
  input: {
    height: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  inputError: {borderColor: colors.error},
  errorText: {fontFamily: fonts.medium, fontSize: 12, color: colors.error, paddingHorizontal: spacing.sm},
  failed: {fontFamily: fonts.medium, fontSize: 13, color: colors.error, marginTop: spacing.lg, textAlign: 'center'},
  save: {
    height: 56,
    marginTop: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveOff: {opacity: 0.5},
  saveText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
});
