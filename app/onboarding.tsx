import {useCallback, useRef, useState} from 'react';
import {BackHandler, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';

import {useSessionUid} from '@/services/session';
import {onboardingStore} from '@/services/onboardingStore';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {OptionButton} from '@/components/onboarding/option-button';
import {StepHeader} from '@/components/onboarding/step-header';
import {ConfidenceSlider} from '@/components/onboarding/confidence-slider';
import {
  STEPS, STEP_COUNT, canContinue, canSkip, emptyAnswers, isAtMax, multiOptions, selectSingle, setConfidence,
  singleOptions, toggleMulti, validateAnswers, type MultiKey, type SingleKey,
} from '@/utils/onboarding/flow';
import {
  AGE_LABELS, BAD_HABIT_LABELS, CHALLENGE_LABELS, CONTINUE, DAYS_LABELS, DERAIL_LABELS, FIRST_STEP_NOTICE,
  FOCUS_LABELS, HABITS_FEEL_LABELS, OCCUPATION_LABELS, SKIP_THIS_ONE, SLEEP_LABELS, STEP_HINTS, STEP_TITLES,
  STUDENT_CHALLENGE_TITLE, VALUE_LABELS,
} from '@/utils/onboarding/copy';
import {completedRecord} from '@/utils/onboarding/record';
import {entryFromParam, recordOnSkip} from '@/utils/onboarding/gate';
import type {Answers} from '@/utils/onboarding/types';

// The onboarding questions (docs/ONBOARDING_SPEC.md, sections 1, 8 and 9): 11 steps in one route, so the
// answers stay in this screen's memory and never travel in navigation params. Opened by Home's gate (first
// run) or by the Settings row (?entry=settings). The record is written only on "Skip setup" or at the end.
// Stage 2: the end saves the answers and closes; the result screens and habit creation come in stage 3.

const LABELS: Record<SingleKey | MultiKey, Record<string, string>> = {
  age: AGE_LABELS,
  occupation: OCCUPATION_LABELS,
  habitsFeel: HABITS_FEEL_LABELS,
  focus: FOCUS_LABELS,
  challenge: CHALLENGE_LABELS,
  derails: DERAIL_LABELS,
  sleep: SLEEP_LABELS,
  days: DAYS_LABELS,
  values: VALUE_LABELS,
  badHabit: BAD_HABIT_LABELS,
};

function isMulti(step: string): step is MultiKey {
  return step === 'focus' || step === 'values';
}

function closeFlow() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// For completedAt: a plain function so the React Compiler lint doesn't treat it as a render-time read
function clockNow(): number {
  return Date.now();
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{entry?: string}>();
  const entry = entryFromParam(params.entry);
  const userId = useSessionUid();
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const savingRef = useRef(false);// a ref, not state, so a second tap in the same frame is ignored

  const step = STEPS[stepIndex];
  const last = stepIndex === STEP_COUNT - 1;

  const goBack = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  // Android hardware Back: the previous step. On step 1 it does nothing; skipping is only "Skip setup".
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]));

  const skipSetup = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const record = recordOnSkip(entry);
    if (record && userId) await onboardingStore.write(userId, record);
    closeFlow();
  };

  // The end of the questions: the answers (without Q10) and the time, keeping templates added by earlier runs
  const finish = async () => {
    const result = validateAnswers(answers);
    if (!result.valid || savingRef.current) return;
    savingRef.current = true;
    if (userId) {
      const previous = await onboardingStore.read(userId);
      await onboardingStore.write(userId, completedRecord(previous.kind === 'ok' ? previous.record : null, result.value, clockNow()));
    }
    closeFlow();
  };

  const next = () => {
    if (!canContinue(answers, step)) return;
    if (last) finish();
    else setStepIndex((i) => i + 1);
  };

  // Q10's "Skip this one": no answer, on to the next step
  const skipQuestion = () => {
    setAnswers((a) => selectSingle(a, 'badHabit', null));
    setStepIndex((i) => i + 1);
  };

  const title = step === 'challenge' && answers.occupation === 'student' ? STUDENT_CHALLENGE_TITLE : STEP_TITLES[step];
  const hint = STEP_HINTS[step];
  const continueOn = canContinue(answers, step);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StepHeader stepIndex={stepIndex} count={STEP_COUNT} onBack={goBack} onSkip={skipSetup} />

      {/* keyed by step, so every step starts scrolled to the top */}
      <ScrollView key={step} contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
        {stepIndex === 0 && <Text style={styles.notice}>{FIRST_STEP_NOTICE}</Text>}

        {step === 'confidence' ? (
          <ConfidenceSlider
            value={answers.confidence}
            onChange={(n) => setAnswers((a) => setConfidence(a, n))}
            label={title}
          />
        ) : isMulti(step) ? (
          <View style={styles.options}>
            {multiOptions(step).map((value) => {
              const selected = (answers[step] as string[]).includes(value);
              return (
                <OptionButton
                  key={value}
                  label={LABELS[step][value]}
                  selected={selected}
                  multi
                  dimmed={!selected && isAtMax(answers, step)}
                  onPress={() => setAnswers((a) => toggleMulti(a, step, value))}
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.options} accessibilityRole="radiogroup">
            {singleOptions(step, answers).map((value) => (
              <OptionButton
                key={value}
                label={LABELS[step][value]}
                selected={answers[step] === value}
                multi={false}
                onPress={() => setAnswers((a) => selectSingle(a, step, value))}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({pressed}) => [styles.continue, !continueOn && styles.continueOff, pressed && continueOn && styles.pressed]}
          onPress={next}
          disabled={!continueOn}
          accessibilityRole="button"
          accessibilityState={{disabled: !continueOn}}>
          <Text style={styles.continueText}>{CONTINUE}</Text>
        </Pressable>
        {canSkip(step) && (
          <Pressable style={styles.skipQuestion} onPress={skipQuestion} hitSlop={8} accessibilityRole="button">
            <Text style={styles.skipQuestionText}>{SKIP_THIS_ONE}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl},
  title: {fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: colors.text},
  hint: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: spacing.sm},
  notice: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: spacing.sm},
  options: {gap: spacing.sm, marginTop: spacing.xl},
  footer: {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm},
  continue: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // soft orange glow (iOS shadow; Android draws the elevation shadow in the same colour on API 28+)
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
  },
  continueOff: {opacity: 0.4, shadowOpacity: 0, elevation: 0},
  continueText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
  pressed: {opacity: 0.85},
  skipQuestion: {alignSelf: 'center', paddingVertical: spacing.sm},
  skipQuestionText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
});
