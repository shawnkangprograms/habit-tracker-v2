import {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {saveName} from '@/services/authActions';
import {getFirebaseAuth} from '@/services/authInit';
import {useProfileName} from '@/services/profileName';
import {useSessionUid} from '@/services/session';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {firstNameFor} from '@/utils/greeting';
import {
  FIRST_NAME_LABEL, LAST_NAME_LABEL, NAME_SAVE, NAME_SAVE_FAILED, NAME_SAVED, NAME_TITLE, visibleError,
} from '@/utils/profileName';
import {PERSON_NAME_MAX, validatePersonName} from '@/validation/validators';

// Settings > Your name: first and last name for the greeting on Home, with the sign-up form's validation.
// Saving needs the network (services/authActions.js saveName): on failure nothing changes and a notice shows;
// on success "Name saved." shows and the screen returns to Settings.

const BACK_AFTER_SAVE_MS = 1000;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

export default function ProfileNameScreen() {
  const uid = useSessionUid();
  const stored = useProfileName(uid);
  const auth = getFirebaseAuth().currentUser;
  // pre-filled from the copy on this phone; an older account without one starts from its displayName's first word
  const [firstName, setFirstName] = useState(() =>
    firstNameFor(stored?.firstName, auth?.uid === uid ? auth?.displayName : null) ?? '');
  const [lastName, setLastName] = useState(() => stored?.lastName ?? '');
  const [touched, setTouched] = useState({first: false, last: false});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const savingRef = useRef(false);// a ref, not only state, so a second tap in the same frame is ignored

  const first = validatePersonName(firstName, 'first');
  const last = validatePersonName(lastName, 'last');
  const canSave = first.valid && last.valid && status !== 'saving' && status !== 'saved';

  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(goBack, BACK_AFTER_SAVE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const save = async () => {
    setTouched({first: true, last: true});
    if (savingRef.current || !first.valid || !last.valid) return;
    savingRef.current = true;
    setStatus('saving');
    try {
      await saveName({firstName: first.value, lastName: last.value});
      setStatus('saved');
    } catch {
      setStatus('failed');
    } finally {
      savingRef.current = false;
    }
  };

  const edit = (setter: (text: string) => void) => (text: string) => {
    setter(text);
    if (status === 'failed') setStatus('idle');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backRow} onPress={goBack} hitSlop={12} accessibilityRole="button">
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
            <Text style={styles.backText}>Settings</Text>
          </Pressable>

          <Text style={styles.title} accessibilityRole="header">{NAME_TITLE}</Text>

          <NameField
            label={FIRST_NAME_LABEL}
            value={firstName}
            onChangeText={edit(setFirstName)}
            onBlur={() => setTouched((t) => ({...t, first: true}))}
            error={visibleError(first, touched.first)}
            autoComplete="name-given"
            textContentType="givenName"
            editable={status !== 'saving'}
          />
          <NameField
            label={LAST_NAME_LABEL}
            value={lastName}
            onChangeText={edit(setLastName)}
            onBlur={() => setTouched((t) => ({...t, last: true}))}
            error={visibleError(last, touched.last)}
            autoComplete="name-family"
            textContentType="familyName"
            editable={status !== 'saving'}
          />

          {status === 'saved' && <Text style={styles.saved} accessibilityLiveRegion="polite">{NAME_SAVED}</Text>}
          {status === 'failed' && <Text style={styles.failed} accessibilityLiveRegion="polite">{NAME_SAVE_FAILED}</Text>}

          <Pressable
            style={({pressed}) => [styles.save, (!canSave || pressed) && styles.saveOff]}
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{disabled: !canSave, busy: status === 'saving'}}>
            {status === 'saving'
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.saveText}>{NAME_SAVE}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NameField(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  error: string | undefined;
  autoComplete: 'name-given' | 'name-family';
  textContentType: 'givenName' | 'familyName';
  editable: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{props.label.toUpperCase()}</Text>
      <TextInput
        style={[styles.input, props.error && styles.inputError]}
        value={props.value}
        onChangeText={props.onChangeText}
        onBlur={props.onBlur}
        accessibilityLabel={props.label}
        autoComplete={props.autoComplete}
        textContentType={props.textContentType}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={PERSON_NAME_MAX * 2}// room for trimming; validatePersonName is the real limit
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
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.lg},
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
  saved: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.green, marginTop: spacing.lg, textAlign: 'center'},
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
