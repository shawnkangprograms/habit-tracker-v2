import {useCallback, useRef, useState} from 'react';
import {BackHandler, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';

import {addHabit, getActiveHabitsWithDays} from '@/db/habits';
import {useSessionUid} from '@/services/session';
import {onboardingStore} from '@/services/onboardingStore';
import {askForReminderPermission} from '@/services/reminderPermission';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {timePickerAvailable} from '@/components/time-field';
import {OptionButton} from '@/components/onboarding/option-button';
import {StepHeader} from '@/components/onboarding/step-header';
import {ConfidenceSlider} from '@/components/onboarding/confidence-slider';
import {BuildingProfile} from '@/components/onboarding/building-profile';
import {ToldUs} from '@/components/onboarding/told-us';
import {HabitProfile} from '@/components/onboarding/habit-profile';
import {RoutineCard} from '@/components/onboarding/routine-card';
import {RoutineReminder} from '@/components/onboarding/routine-reminder';
import {
  STEPS, STEP_COUNT, canContinue, canSkip, emptyAnswers, isAtMax, multiOptions, selectSingle, setConfidence,
  singleOptions, toggleMulti, validateAnswers, type MultiKey, type SingleKey,
} from '@/utils/onboarding/flow';
import {
  ADD_OWN_HABIT, AGE_LABELS, BAD_HABIT_LABELS, CHALLENGE_LABELS, CONTINUE, CREATE_FAILED, DAYS_LABELS, DERAIL_LABELS,
  DONE, FIRST_STEP_NOTICE, FOCUS_LABELS, HABITS_FEEL_LABELS, NOTHING_LEFT, OCCUPATION_LABELS, ROUTINE_HINT, ROUTINE_TITLE,
  SKIP_THIS_ONE, SLEEP_LABELS, START, STEP_HINTS, STEP_TITLES, STUDENT_CHALLENGE_TITLE, VALUE_LABELS,
} from '@/utils/onboarding/copy';
import {entryFromParam, recordOnSkip} from '@/utils/onboarding/gate';
import {
  ROUTINE_REMINDER_DEFAULT, buildPlan, createPlannedHabits, type CreateSession, type Plan,
} from '@/utils/onboarding/plan';
import type {ParsedRecord} from '@/utils/onboarding/record';
import type {Answers, CompleteAnswers} from '@/utils/onboarding/types';

// Onboarding (docs/ONBOARDING_SPEC.md, sections 1, 5, 8 and 9): the 11 questions, then Building Profile,
// "What you told us", Habit Profile and the Recommended Routine, all in one route, so the answers (Q10
// included) stay in this screen's memory and never travel in navigation params. Opened by Home's gate (first
// run) or by the Settings row (?entry=settings, a retake).
//
// The record is written only by "Skip setup" (utils/onboarding/gate.ts) or by the routine's habit creation
// (utils/onboarding/plan.ts: after the first habit, or on Start with nothing selected). Leaving any other way,
// including the app being killed before the first habit, writes nothing.

type Phase = 'questions' | 'building' | 'toldUs' | 'profile' | 'routine';

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

const NO_RECORD: ParsedRecord = {kind: 'none'};

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

// The plan for these answers: the local record (retake: templates added before) and the names of the user's
// active habits (retake: a replace habit they already have). A failed habits read only means no name dedupe.
async function loadPlan(userId: string | null, answers: CompleteAnswers): Promise<Plan> {
  if (!userId) return buildPlan(answers, NO_RECORD, []);
  const [stored, names] = await Promise.all([
    onboardingStore.read(userId),
    (getActiveHabitsWithDays(userId) as Promise<{habitName: string}[]>)
      .then((rows) => rows.map((row) => row.habitName))
      .catch(() => [] as string[]),
  ]);
  return buildPlan(answers, stored, names);
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{entry?: string}>();
  const entry = entryFromParam(params.entry);
  const userId = useSessionUid();
  const reduceMotion = useReduceMotion();

  const [phase, setPhase] = useState<Phase>('questions');
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const planRequest = useRef(0);// id of the newest plan load; an older one finishing later is ignored

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [created, setCreated] = useState<ReadonlySet<string>>(new Set());
  const session = useRef<CreateSession>({created: new Set(), saved: null});
  const runningRef = useRef(false);// a ref, not only state, so a second tap in the same frame is ignored
  const [running, setRunning] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const [reminderOn, setReminderOn] = useState(true);
  const [reminderTime, setReminderTime] = useState(ROUTINE_REMINDER_DEFAULT);
  const [pickerAvailable] = useState(timePickerAvailable);// fixed for the app run
  const skippingRef = useRef(false);

  const step = STEPS[stepIndex];
  const anyCreated = created.size > 0;
  // Once a habit exists, the answers that produced it can't be changed: no way back from the routine
  const canGoBack = phase === 'questions' ? stepIndex > 0
    : phase === 'toldUs' || phase === 'profile' || (phase === 'routine' && !anyCreated && !running);

  const goBack = useCallback(() => {
    if (phase === 'questions') setStepIndex((i) => Math.max(0, i - 1));
    else if (phase === 'toldUs') setPhase('questions');// back to Q11, answers kept
    else if (phase === 'profile') setPhase('toldUs');
    else if (phase === 'routine' && !anyCreated && !running) setPhase('profile');
  }, [phase, anyCreated, running]);

  // Android hardware Back: one step back. Nothing on step 1 or Building Profile, and nothing on the routine once
  // a habit exists; skipping is only "Skip setup".
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]));

  // On any screen. Ignored while habits are being created.
  const skipSetup = async () => {
    if (skippingRef.current || runningRef.current) return;
    skippingRef.current = true;
    const record = recordOnSkip(entry, session.current.saved !== null);
    if (record && userId) await onboardingStore.write(userId, record);
    closeFlow();
  };

  // After Q11: Building Profile shows while the plan is built (a local read and pure maths)
  const startResults = () => {
    const result = validateAnswers(answers);
    if (!result.valid) return;
    const request = ++planRequest.current;
    setPlan(null);
    setPhase('building');
    loadPlan(userId, result.value).then((next) => {
      if (request !== planRequest.current) return;
      setPlan(next);
      setSelected(new Set(next.picks.map((p) => p.id)));
    });
  };

  const onBuilt = useCallback(() => setPhase('toldUs'), []);

  const nextQuestion = () => {
    if (!canContinue(answers, step)) return;
    if (stepIndex === STEP_COUNT - 1) startResults();
    else setStepIndex((i) => i + 1);
  };

  // Q10's "Skip this one": no answer, on to the next step
  const skipQuestion = () => {
    setAnswers((a) => selectSingle(a, 'badHabit', null));
    setStepIndex((i) => i + 1);
  };

  const toggleCard = (id: string) => {
    if (runningRef.current || created.has(id)) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Creates the selected cards one at a time (utils/onboarding/plan.ts). Resolves true when everything selected
  // exists; false if one failed (what was created stays, and Start tries the rest) or nothing could run.
  const createSelected = async (): Promise<boolean> => {
    if (!plan || !userId || runningRef.current) return false;
    runningRef.current = true;
    setRunning(true);
    setCreateFailed(false);
    try {
      const result = await createPlannedHabits({
        addHabit: (input) => addHabit(userId, input),
        saveRecord: (record) => onboardingStore.write(userId, record),
        now: clockNow,
        onCreated: (id) => setCreated((c) => new Set(c).add(id)),
      }, {plan, selected, reminderTime: reminderOn ? reminderTime : null, session: session.current});
      session.current = {created: result.created, saved: result.saved};
      if (result.failed) {
        setCreateFailed(true);
        return false;
      }
      // only after the habits exist, and only if they have a reminder time
      if (reminderOn && result.created.size > 0) await askForReminderPermission();
      return true;
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const start = async () => {
    if (await createSelected()) closeFlow();
  };

  // Saves the selected cards first, then the habit form takes this screen's place (its Back goes to Home)
  const addOwnHabit = async () => {
    if (await createSelected()) router.replace('/habit-form');
  };

  const continueOn = canContinue(answers, step);
  const title = step === 'challenge' && answers.occupation === 'student' ? STUDENT_CHALLENGE_TITLE : STEP_TITLES[step];
  const hint = STEP_HINTS[step];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StepHeader
        progress={phase === 'questions' ? {index: stepIndex, count: STEP_COUNT} : null}
        canGoBack={canGoBack}
        onBack={goBack}
        onSkip={skipSetup}
      />

      {/* keyed by step or screen, so each starts scrolled to the top */}
      <ScrollView key={phase === 'questions' ? step : phase} contentContainerStyle={styles.content}>
        {phase === 'questions' && (
          <>
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
                  const isSelected = (answers[step] as string[]).includes(value);
                  return (
                    <OptionButton
                      key={value}
                      label={LABELS[step][value]}
                      selected={isSelected}
                      multi
                      dimmed={!isSelected && isAtMax(answers, step)}
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
          </>
        )}

        {phase === 'building' && <BuildingProfile reduceMotion={reduceMotion} ready={plan !== null} onDone={onBuilt} />}

        {phase === 'toldUs' && plan && <ToldUs answers={plan.answers} focus={plan.focus} />}

        {phase === 'profile' && plan && <HabitProfile scores={plan.scores} focus={plan.focus} />}

        {phase === 'routine' && plan && (
          <View style={styles.routine}>
            <Text style={styles.title} accessibilityRole="header">{ROUTINE_TITLE}</Text>
            {plan.picks.length > 0 ? (
              <>
                <Text style={styles.hint}>{ROUTINE_HINT}</Text>
                <View style={styles.cards}>
                  {plan.picks.map((pick) => (
                    <RoutineCard
                      key={pick.id}
                      pick={pick}
                      selected={selected.has(pick.id)}
                      added={created.has(pick.id)}
                      disabled={running}
                      onToggle={() => toggleCard(pick.id)}
                    />
                  ))}
                </View>
                <RoutineReminder
                  on={reminderOn}
                  time={reminderTime}
                  pickerAvailable={pickerAvailable}
                  disabled={running}
                  onToggle={setReminderOn}
                  onTime={setReminderTime}
                />
              </>
            ) : (
              <Text style={styles.nothingLeft}>{NOTHING_LEFT}</Text>
            )}
          </View>
        )}
      </ScrollView>

      {phase !== 'building' && (
        <View style={styles.footer}>
          {phase === 'questions' && (
            <>
              <PrimaryButton label={CONTINUE} enabled={continueOn} onPress={nextQuestion} />
              {canSkip(step) && (
                <Pressable style={styles.textButton} onPress={skipQuestion} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.textButtonText}>{SKIP_THIS_ONE}</Text>
                </Pressable>
              )}
            </>
          )}

          {phase === 'toldUs' && <PrimaryButton label={CONTINUE} enabled onPress={() => setPhase('profile')} />}
          {phase === 'profile' && <PrimaryButton label={CONTINUE} enabled onPress={() => setPhase('routine')} />}

          {phase === 'routine' && plan && (
            <>
              {createFailed && <Text style={styles.error} accessibilityLiveRegion="polite">{CREATE_FAILED}</Text>}
              <PrimaryButton label={plan.picks.length > 0 ? START : DONE} enabled={!running} onPress={start} />
              <Pressable
                style={({pressed}) => [styles.secondary, running && styles.off, pressed && !running && styles.pressed]}
                onPress={addOwnHabit}
                disabled={running}
                accessibilityRole="button"
                accessibilityState={{disabled: running}}>
                <Text style={styles.secondaryText}>{ADD_OWN_HABIT}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function PrimaryButton({label, enabled, onPress}: {label: string; enabled: boolean; onPress: () => void}) {
  return (
    <Pressable
      style={({pressed}) => [styles.primary, !enabled && styles.primaryOff, pressed && enabled && styles.pressed]}
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{disabled: !enabled}}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl},
  title: {fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: colors.text},
  hint: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: spacing.sm},
  notice: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: spacing.sm},
  options: {gap: spacing.sm, marginTop: spacing.xl},
  routine: {gap: spacing.sm},
  cards: {gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.lg},
  nothingLeft: {fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: spacing.md},
  footer: {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm},
  primary: {
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
  primaryOff: {opacity: 0.4, shadowOpacity: 0, elevation: 0},
  primaryText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
  secondary: {
    height: 52,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.accent},
  off: {opacity: 0.4},
  pressed: {opacity: 0.85},
  textButton: {alignSelf: 'center', paddingVertical: spacing.sm},
  textButtonText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  error: {fontFamily: fonts.medium, fontSize: 13, color: colors.error, textAlign: 'center'},
});
