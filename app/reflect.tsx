import {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {getHabitsWithTodayStatus} from '@/db/habits';
import {useKeyboardPadding} from '@/hooks/use-keyboard-padding';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {reflectionsStore} from '@/services/reflectionsStore';
import {useSessionUid} from '@/services/session';
import {markStale} from '@/services/statsStore';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {getLocalDateString} from '@/utils/dates';
import {
  ALREADY_BODY, ALREADY_TITLE, DISCARD_BODY, DISCARD_CANCEL, DISCARD_CONFIRM, DISCARD_TITLE, NO_REWARD_LINE,
  REWARD_LINE, SAVE_BUTTON, SAVE_FAILED_BODY, SAVE_FAILED_TITLE, SAVE_HINT_DISABLED, SCREEN_BACK, SCREEN_INTRO,
  SCREEN_TITLE, TEXT_LABEL, TEXT_PLACEHOLDER, TEXT_TOO_LONG, textCounter,
} from '@/utils/reflections/copy';
import {QUESTIONS, hasAnyAnswer, isComplete, type PartialAnswers, type QuestionId} from '@/utils/reflections/questions';
import {REFLECTION_TEXT_MAX, cleanText, textError, textLength} from '@/utils/reflections/record';
import {wouldReward} from '@/utils/reflections/rewards';

// One reflection on one habit and day (docs/PACKS_REPORTS_SPEC.md, sections 12 and 16), opened from Home's bar.
// A full-screen route, not a sheet (the Itel has had gesture trouble); the swipe-back gesture is off in
// app/_layout.tsx, so leaving goes through Back here or Android's Back, which both ask before dropping answers.
// Four one-tap questions earn the reward; the optional free text never does. Saved on this phone only. After a
// save the stats are marked stale (an AsyncStorage write isn't a database change) and Home, on its next focus,
// reloads them and shows the level-up or a short toast.
//
// Keyboard: on Android the window doesn't resize for it (edge-to-edge), so the keyboard's height is added as
// bottom padding to the scroll content (hooks/use-keyboard-padding.ts) and, while the text field is focused, the
// content is scrolled to the end: the field, its counter and error line, the reward line and Save. Android Back
// closes the keyboard first (the system handles that), then reaches the discard check below.

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

type Params = {habitId?: string; habitName?: string; date?: string};

export default function ReflectScreen() {
  const params = useLocalSearchParams<Params>();
  const habitId = typeof params.habitId === 'string' ? params.habitId : '';
  const habitName = typeof params.habitName === 'string' ? params.habitName : '';
  const date = typeof params.date === 'string' ? params.date : getLocalDateString();
  const uid = useSessionUid();
  const [answers, setAnswers] = useState<PartialAnswers>({});
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [pays, setPays] = useState<boolean | null>(null);// null: not known yet (or another day): the reward line shows
  const keyboardPad = useKeyboardPadding();
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [textFocused, setTextFocused] = useState(false);

  // Once the padding is in place (the frame after it renders), bring the field and Save above the keyboard
  useEffect(() => {
    if (!textFocused || keyboardPad === 0) return;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({animated: !reduceMotion}));
    return () => cancelAnimationFrame(frame);
  }, [textFocused, keyboardPad, reduceMotion]);

  // Whether this one would still earn XP. Only today's ticks are on hand; for another day the line stays positive.
  useEffect(() => {
    if (!uid || !habitId || date !== getLocalDateString()) return;
    let cancelled = false;
    Promise.all([reflectionsStore.read(uid), getHabitsWithTodayStatus(uid) as Promise<{habitId: string; completed: number}[]>])
      .then(([record, rows]) => {
        const ticked = new Set(rows.filter((r) => r.completed === 1).map((r) => r.habitId));
        if (!cancelled) setPays(wouldReward(record, {habitId, date, ticked}));
      })
      .catch((err: unknown) => console.log('Reflection reward check failed', err));
    return () => {
      cancelled = true;
    };
  }, [uid, habitId, date]);

  const tooLong = textError(text) !== null;
  const complete = isComplete(answers);
  const canSave = complete && !tooLong && !saving && !!uid && !!habitId;
  const dirty = hasAnyAnswer(answers) || cleanText(text).length > 0;

  // Back with answers given asks first; with nothing given it just leaves
  const goBack = () => {
    if (saving) return;
    if (!dirty) {
      leave();
      return;
    }
    Alert.alert(DISCARD_TITLE, DISCARD_BODY, [
      {text: DISCARD_CANCEL, style: 'cancel'},
      {text: DISCARD_CONFIRM, style: 'destructive', onPress: leave},
    ]);
  };

  // Android hardware Back: the same as the back row. Added once per focus; calls the latest goBack through a ref.
  const goBackRef = useRef(goBack);
  useEffect(() => {
    goBackRef.current = goBack;
  });
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, []));

  const choose = (id: QuestionId, tag: string) => setAnswers((a) => ({...a, [id]: tag}));

  const save = async () => {
    if (!canSave || !uid || !isComplete(answers)) return;
    setSaving(true);
    const result = await reflectionsStore.save(uid, {habitId, date, answers, text, savedAt: Date.now()});
    if (result === 'failed') {
      setSaving(false);
      Alert.alert(SAVE_FAILED_TITLE, SAVE_FAILED_BODY);
      return;
    }
    if (result === 'exists') {
      Alert.alert(ALREADY_TITLE, ALREADY_BODY, [{text: 'OK', onPress: leave}]);
      return;
    }
    markStale();
    reflectionsStore.markRewardPending(uid);
    leave();
  };

  const length = textLength(cleanText(text));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, {paddingBottom: spacing.xl + keyboardPad}]}
          keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backRow} onPress={goBack} hitSlop={12} accessibilityRole="button">
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
            <Text style={styles.backText}>{SCREEN_BACK}</Text>
          </Pressable>

          <Text style={styles.title} accessibilityRole="header">{SCREEN_TITLE}</Text>
          <Text style={styles.habit} numberOfLines={1}>{habitName}</Text>
          <Text style={styles.intro}>{SCREEN_INTRO}</Text>

          {QUESTIONS.map((question) => (
            <View key={question.id} style={styles.section}>
              <Text style={styles.question} accessibilityRole="header">{question.title}</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={question.title}>
                {question.options.map((option, i) => {
                  const selected = answers[question.id] === option.tag;
                  return (
                    <Pressable
                      key={option.tag}
                      onPress={() => choose(question.id, option.tag)}
                      style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                      hitSlop={4}
                      accessibilityRole="radio"
                      accessibilityState={{selected}}
                      accessibilityLabel={`${option.label}, ${i + 1} of ${question.options.length}`}>
                      <Text style={[styles.chipText, selected && styles.whiteText]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {/* the optional free text: never affects XP */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{TEXT_LABEL}</Text>
              <Text style={[styles.label, tooLong && styles.errorColor]}>{textCounter(length, REFLECTION_TEXT_MAX)}</Text>
            </View>
            <TextInput
              style={[styles.input, tooLong && styles.inputError]}
              value={text}
              onChangeText={setText}
              onFocus={() => setTextFocused(true)}
              onBlur={() => setTextFocused(false)}
              placeholder={TEXT_PLACEHOLDER}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              multiline
              maxLength={REFLECTION_TEXT_MAX * 2}// room for trimming and emoji; textError is the real limit
              textAlignVertical="top"
              accessibilityLabel={TEXT_LABEL}
            />
            {tooLong ? <Text style={styles.errorText}>{TEXT_TOO_LONG}</Text> : null}
          </View>

          {/* inside the scroll view, so the keyboard can never hide it */}
          <Text style={styles.reward}>{pays === false ? NO_REWARD_LINE : REWARD_LINE}</Text>
          <Pressable
            style={({pressed}) => [styles.primaryButton, (!canSave || pressed) && styles.saveOff]}
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityHint={complete ? undefined : SAVE_HINT_DISABLED}
            accessibilityState={{disabled: !canSave, busy: saving}}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{SAVE_BUTTON}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  flex: {flex: 1},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.lg},
  habit: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.accent, marginTop: spacing.xs},
  intro: {fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: spacing.sm},
  section: {marginTop: spacing.xl},
  question: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.text, marginBottom: spacing.sm},
  labelRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm},
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {height: 40, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  chipSelected: {backgroundColor: colors.accent},
  chipUnselected: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  chipText: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted},
  whiteText: {color: colors.white},
  input: {
    minHeight: 96,
    borderRadius: radii.habitCard,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  inputError: {borderColor: colors.error},
  errorText: {fontFamily: fonts.medium, fontSize: 12, color: colors.error, marginTop: spacing.sm},
  errorColor: {color: colors.error},
  reward: {fontFamily: fonts.medium, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.md},
  primaryButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveOff: {opacity: 0.5},
  primaryText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
});
