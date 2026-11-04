import {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';
import Animated, {
  Easing, Keyframe, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';

import {addHabit, getActiveHabitsWithDays} from '@/db/habits';
import type {IconId} from '@/constants/habits';
import {selectionHaptic} from '@/services/haptics';
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
import {RoutineGroup} from '@/components/onboarding/routine-group';
import {packsStore} from '@/services/packsStore';
import {packsAfterRun, routineGroups, runPacks, type RunJoin} from '@/utils/packs/choose';
import type {HabitRef} from '@/utils/packs/membership';
import type {ParsedPacks} from '@/utils/packs/record';
import {
  STEPS, STEP_COUNT, canContinue, canSkip, emptyAnswers, isAtMax, multiOptions, selectSingle, setConfidence,
  singleOptions, toggleMulti, validateAnswers, type MultiKey, type SingleKey,
} from '@/utils/onboarding/flow';
import {
  ADD_OWN_HABIT, BAD_HABIT_LABELS, CHALLENGE_LABELS, CONTINUE, CREATE_FAILED, DAYS_LABELS, DERAIL_LABELS,
  DONE, FIRST_STEP_NOTICE, FOCUS_LABELS, HABITS_FEEL_LABELS, NOTHING_LEFT, OCCUPATION_LABELS, OWN_HABIT_REASON,
  ROUTINE_HINT, ROUTINE_OTHER_GROUP, ROUTINE_TITLE, SKIP_THIS_ONE, SLEEP_LABELS, START, STEP_HINTS, STEP_TITLES,
  STUDENT_CHALLENGE_TITLE, TIME_BUDGET_LABELS, VALUE_LABELS, routineSubtitle,
} from '@/utils/onboarding/copy';
import {entryFromParam, recordOnSkip, shouldCloseForSession} from '@/utils/onboarding/gate';
import {
  LEAVING_AUTO_MS, skipCopy, skipDialogNext, type SkipDialogEvent, type SkipDialogState,
} from '@/utils/onboarding/skipDialog';
import {onboardingLaunch} from '@/services/onboardingLaunch';
import {SkipDialog} from '@/components/onboarding/skip-dialog';
import {
  ROUTINE_REMINDER_DEFAULT, buildPlan, createPlannedHabits, newHabitIds, recordAfterOwnHabit, type CreateSession,
  type Plan,
} from '@/utils/onboarding/plan';
import type {StarterPick} from '@/utils/onboarding/starters';
import {
  BUTTON_PRESS_IN_MS, BUTTON_PRESS_OUT_MS, BUTTON_PRESS_SCALE, STEP_ENTER_MS, enterOffsetX, shouldAnimate,
  stepDirection, type Direction,
} from '@/utils/onboarding/motion';
import type {ParsedRecord} from '@/utils/onboarding/record';
import {TEMPLATE_IDS, isOneOf, type Answers, type CompleteAnswers} from '@/utils/onboarding/types';

// Onboarding (docs/ONBOARDING_SPEC.md, sections 1, 5, 8 and 9): the 11 questions, then Building Profile,
// "What you told us", Habit Profile and the Recommended Routine, all in one route, so the answers (Q10
// included) stay in this screen's memory and never travel in navigation params. Opened by Home's gate (first
// run) or by the Settings row (?entry=settings, a retake).
//
// The record is written only by "Skip setup" (utils/onboarding/gate.ts) or by the routine's habit creation
// (utils/onboarding/plan.ts: after the first habit, on Start with nothing selected, or when the user's own habit
// from the habit form is the first one). Leaving any other way, including the app being killed before the first
// habit, writes nothing.
//
// "Add your own habit" pushes the habit form over this screen, so its Back returns to the routine. The active
// habit ids are read just before it opens; on returning, any new id is the user's own habit, shown as an added
// card under "Other habits" (and it counts as "a habit exists": no way back from the routine).
//
// Packs (docs/PACKS_REPORTS_SPEC.md, section 3; utils/packs/choose.ts): the starters come from the two packs
// chosen from the scores, and the cards are grouped under the pack each will join, then "Other habits". The pack
// record is written at every moment the onboarding record is (right after it), never on Skip; the two packs are
// created once the run has made a habit and the user has no packs (any run, first or from Settings). Its failure is
// swallowed and never blocks onboarding, and onboarding never checks the habit or pack limits.
//
// Motion (stage 4, timings in utils/onboarding/motion.ts): a new question fades in, and its options also slide in
// from the side it came from (enter only; nothing on the first step). The title only fades, so no transform ever
// touches the title text. The buttons scale slightly while pressed. Answer changes play a light haptic. No motion
// under reduced motion; haptics stay.

type Phase = 'questions' | 'building' | 'toldUs' | 'profile' | 'routine';

const LABELS: Record<SingleKey | MultiKey, Record<string, string>> = {
  timeBudget: TIME_BUDGET_LABELS,
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
const NO_PACKS: ParsedPacks = {kind: 'none'};

// What the routine's pack write needs besides the plan: the pack record and the active habits at plan time
type RunContext = {packs: ParsedPacks; existing: HabitRef[]};

function isMulti(step: string): step is MultiKey {
  return step === 'focus' || step === 'values';
}

const SYSTEM = ReduceMotion.System;// a backstop for the first render, before useReduceMotion has read the setting

// The new step's content: from 16 px on the side it came from, fading in. undefined = no animation.
function stepEntering(direction: Direction | null, animate: boolean) {
  if (!animate || direction === null) return undefined;
  return new Keyframe({
    0: {opacity: 0, transform: [{translateX: enterOffsetX(direction)}]},
    100: {opacity: 1, transform: [{translateX: 0}], easing: Easing.out(Easing.cubic)},
  }).duration(STEP_ENTER_MS).reduceMotion(SYSTEM);
}

// The new step's title, hint and notice: the same timing, opacity only
function titleEntering(direction: Direction | null, animate: boolean) {
  if (!animate || direction === null) return undefined;
  return new Keyframe({
    0: {opacity: 0},
    100: {opacity: 1, easing: Easing.out(Easing.cubic)},
  }).duration(STEP_ENTER_MS).reduceMotion(SYSTEM);
}

type OwnHabit = {habitId: string; habitName: string; icon: IconId};

// The user's active habits, for "Add your own habit": ids before the form opens, and the new ones after
async function activeHabits(userId: string): Promise<OwnHabit[]> {
  return getActiveHabitsWithDays(userId) as Promise<OwnHabit[]>;
}

function closeFlow() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// For completedAt: a plain function so the React Compiler lint doesn't treat it as a render-time read
function clockNow(): number {
  return Date.now();
}

// The plan for these answers: the local record (retake: templates added before) and the user's active habits
// (retake: a replace habit they already have; adoption into new packs). A failed habits read only means no name
// dedupe and no adoption. The pack record says which packs the starters can join.
async function loadPlan(userId: string | null, answers: CompleteAnswers): Promise<{plan: Plan; context: RunContext}> {
  if (!userId) return {plan: buildPlan(answers, NO_RECORD, []), context: {packs: NO_PACKS, existing: []}};
  const [stored, existing, packs] = await Promise.all([
    onboardingStore.read(userId),
    activeHabits(userId)
      .then((rows): HabitRef[] => rows.map(({habitId, habitName}) => ({habitId, habitName})))
      .catch((): HabitRef[] => []),
    packsStore.read(userId),
  ]);
  return {plan: buildPlan(answers, stored, existing.map((h) => h.habitName)), context: {packs, existing}};
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{entry?: string}>();
  const entry = entryFromParam(params.entry);
  const userId = useSessionUid();
  const reduceMotion = useReduceMotion();
  const animate = shouldAnimate(reduceMotion);

  const [phase, setPhase] = useState<Phase>('questions');
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<Direction | null>(null);// how the questions last moved
  const [plan, setPlan] = useState<Plan | null>(null);
  const [context, setContext] = useState<RunContext>({packs: NO_PACKS, existing: []});
  const planRequest = useRef(0);// id of the newest plan load; an older one finishing later is ignored
  const joins = useRef<RunJoin[]>([]);// starters created in this run, for the pack record
  const madeHabit = useRef(false);// this run created a habit (a starter or the user's own): packs may be created

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
  const [ownHabits, setOwnHabits] = useState<OwnHabit[]>([]);// made in the habit form during this run
  const formOpenedWith = useRef<ReadonlySet<string> | null>(null);// active ids when the form opened; null = not open

  const step = STEPS[stepIndex];
  const anyCreated = created.size > 0 || ownHabits.length > 0;
  // Once a habit exists, the answers that produced it can't be changed: no way back from the routine
  const canGoBack = phase === 'questions' ? stepIndex > 0
    : phase === 'toldUs' || phase === 'profile' || (phase === 'routine' && !anyCreated && !running);

  // Not wrapped in useCallback: the React Compiler memoizes it (a manual list here fails its lint)
  const goBack = () => {
    if (phase === 'questions') {
      const previous = Math.max(0, stepIndex - 1);
      setDirection(stepDirection(stepIndex, previous));
      setStepIndex(previous);
    } else if (phase === 'toldUs') {
      setDirection('back');// Q11 comes back in from the left, answers kept
      setPhase('questions');
    } else if (phase === 'profile') setPhase('toldUs');
    else if (phase === 'routine' && !anyCreated && !running) setPhase('profile');
  };

  // Android hardware Back: one step back. Nothing on step 1 or Building Profile, and nothing on the routine once
  // a habit exists; skipping is only "Skip setup".
  // The listener is added once per focus and calls the latest goBack through a ref.
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

  // "Skip setup", on any screen: a confirmation first (utils/onboarding/skipDialog.ts). Opening it is ignored while
  // habits are being created. "Yes" writes what Skip always wrote (recordOnSkip: a skip record on the first run,
  // nothing from Settings or once a habit exists) at once, so a kill during the notice still counts; the flow
  // closes when the notice is done.
  const [skipState, setSkipState] = useState<SkipDialogState>('closed');
  const onSkipEvent = (event: SkipDialogEvent) => {
    const busy = runningRef.current;
    setSkipState((s) => skipDialogNext(s, event, busy));
  };
  const skipSetup = () => onSkipEvent('open');

  useEffect(() => {
    if (skipState !== 'leaving') return;
    if (!skippingRef.current) {
      skippingRef.current = true;
      const record = recordOnSkip(entry, session.current.saved !== null);
      if (record && userId) onboardingStore.write(userId, record);// never throws
    }
    const timer = setTimeout(() => setSkipState((s) => skipDialogNext(s, 'timeout', false)), LEAVING_AUTO_MS);
    return () => clearTimeout(timer);
  }, [skipState, entry, userId]);

  useEffect(() => {
    if (skipState === 'done') closeFlow();
  }, [skipState]);

  // Open while mounted, so Home's sign-up launch and the gate never push a second copy
  useEffect(() => {
    onboardingLaunch.setOpen(true);
    return () => onboardingLaunch.setOpen(false);
  }, []);

  // No one signed in (a sign-up rolled back after Home opened this): close
  useEffect(() => {
    if (shouldCloseForSession(userId)) closeFlow();
  }, [userId]);

  // After Q11: Building Profile shows while the plan is built (a local read and pure maths)
  const startResults = () => {
    const result = validateAnswers(answers);
    if (!result.valid) return;
    const request = ++planRequest.current;
    setPlan(null);
    setPhase('building');
    loadPlan(userId, result.value).then((next) => {
      if (request !== planRequest.current) return;
      setPlan(next.plan);
      setContext(next.context);
      setSelected(new Set(next.plan.picks.map((p) => p.id)));
    });
  };

  // The pack record, written right after each onboarding record save (utils/packs/choose.ts): the packs are created
  // once this run has made a habit and the user has none. Never throws.
  const existing = context.existing;
  const savePacks = useCallback((uid: string, current: Plan) => packsStore.update(uid, (parsed) => packsAfterRun(parsed, {
    chosen: current.packs, create: madeHabit.current, joins: joins.current, existing, now: clockNow(),
  })), [existing]);

  const onBuilt = () => setPhase('toldUs');// stable: the React Compiler memoizes it

  const nextQuestion = () => {
    if (!canContinue(answers, step)) return;
    if (stepIndex === STEP_COUNT - 1) startResults();
    else forward();
  };

  const forward = () => {
    setDirection(stepDirection(stepIndex, stepIndex + 1));
    setStepIndex(stepIndex + 1);
  };

  // Q10's "Skip this one": no answer, on to the next step
  const skipQuestion = () => {
    setAnswers((a) => selectSingle(a, 'badHabit', null));
    forward();
  };

  // A light haptic only when the answer actually changes (a tap on the picked option, or on a dimmed one, doesn't)
  const pickSingle = (key: SingleKey, value: string) => {
    if (answers[key] !== value) selectionHaptic();
    setAnswers((a) => selectSingle(a, key, value));
  };
  const pickMulti = (key: MultiKey, value: string) => {
    if ((answers[key] as string[]).includes(value) || !isAtMax(answers, key)) selectionHaptic();
    setAnswers((a) => toggleMulti(a, key, value));
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
  // writeIfNone: false for "Add your own habit", which must not write the "chose none" record.
  const createSelected = async (writeIfNone = true): Promise<boolean> => {
    if (!plan || !userId || runningRef.current) return false;
    runningRef.current = true;
    setRunning(true);
    setCreateFailed(false);
    try {
      const result = await createPlannedHabits({
        addHabit: (input) => addHabit(userId, input),
        saveRecord: async (record) => {
          await onboardingStore.write(userId, record);
          await savePacks(userId, plan);
        },
        now: clockNow,
        onCreated: (id, habitId) => {
          setCreated((c) => new Set(c).add(id));
          madeHabit.current = true;
          if (habitId && isOneOf(TEMPLATE_IDS, id)) joins.current.push({templateId: id, habitId});
        },
      }, {plan, selected, reminderTime: reminderOn ? reminderTime : null, session: session.current, writeIfNone});
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

  // Saves the selected cards first, then opens the habit form over this screen (its Back returns here)
  const addOwnHabit = async () => {
    if (!userId || !(await createSelected(false))) return;
    const before = await activeHabits(userId).catch(() => null);
    if (!before) return;// without the ids before, a new habit couldn't be told apart; stay here
    formOpenedWith.current = new Set(before.map((h) => h.habitId));
    router.push('/habit-form');
  };

  // Back from the habit form: a habit that wasn't there before is the user's own. The first habit of this run
  // writes the finished record (plan.ts); later ones change nothing in it. Not cancelled on blur: the record
  // write must happen even if the user moves on before the read returns.
  useFocusEffect(useCallback(() => {
    const before = formOpenedWith.current;
    if (!before || !userId || !plan) return;
    formOpenedWith.current = null;
    activeHabits(userId).then(async (rows) => {
      const fresh = newHabitIds(before, rows.map((h) => h.habitId));
      if (fresh.length === 0) return;
      setOwnHabits((own) => [...own, ...rows.filter((h) => fresh.includes(h.habitId))]);
      madeHabit.current = true;
      const record = recordAfterOwnHabit(plan, session.current, clockNow());
      if (record) {
        session.current = {...session.current, saved: record};
        await onboardingStore.write(userId, record);
        await savePacks(userId, plan);
      }
    }).catch(() => {});
  }, [userId, plan, savePacks]));

  // The routine's groups: each card under the pack it will join (runPacks previews the packs this run joins, or
  // creates once a card is added), the rest under "Other habits". The stagger runs down the cards in that order.
  const groups = plan ? routineGroups(plan.picks, runPacks(context.packs, plan.packs, true, 0), plan.packs) : null;
  const cardOrder = groups ? [...groups.packs.flatMap((g) => g.picks), ...groups.other] : [];
  const pickCard = (pick: StarterPick) => (
    <RoutineCard
      key={pick.id}
      pick={pick}
      index={cardOrder.indexOf(pick)}
      selected={selected.has(pick.id)}
      added={created.has(pick.id)}
      disabled={running}
      reduceMotion={reduceMotion}
      onToggle={() => toggleCard(pick.id)}
    />
  );

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
            <Animated.View entering={titleEntering(direction, animate)}>
              <Text style={styles.title} accessibilityRole="header">{title}</Text>
              {hint && <Text style={styles.hint}>{hint}</Text>}
              {stepIndex === 0 && <Text style={styles.notice}>{FIRST_STEP_NOTICE}</Text>}
            </Animated.View>

            <Animated.View entering={stepEntering(direction, animate)}>
              {step === 'confidence' ? (
                <ConfidenceSlider
                  value={answers.confidence}
                  onChange={(n) => setAnswers((a) => setConfidence(a, n))}
                  label={title}
                  reduceMotion={reduceMotion}
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
                        reduceMotion={reduceMotion}
                        onPress={() => pickMulti(step, value)}
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
                      reduceMotion={reduceMotion}
                      onPress={() => pickSingle(step, value)}
                    />
                  ))}
                </View>
              )}
            </Animated.View>
          </>
        )}

        {phase === 'building' && <BuildingProfile reduceMotion={reduceMotion} ready={plan !== null} onDone={onBuilt} />}

        {phase === 'toldUs' && plan && <ToldUs answers={plan.answers} focus={plan.focus} reduceMotion={reduceMotion} />}

        {phase === 'profile' && plan && <HabitProfile scores={plan.scores} focus={plan.focus} />}

        {phase === 'routine' && plan && (
          <View style={styles.routine}>
            <Text style={styles.title} accessibilityRole="header">{ROUTINE_TITLE}</Text>
            {groups?.subtitle && plan.picks.length > 0 && (
              <Text style={styles.hint}>{routineSubtitle(...groups.subtitle)}</Text>
            )}
            {plan.picks.length > 0 ? <Text style={styles.hint}>{ROUTINE_HINT}</Text> : <Text style={styles.nothingLeft}>{NOTHING_LEFT}</Text>}
            {groups?.packs.map((group) => (
              <RoutineGroup key={group.packId} label={group.name}>
                {group.picks.map((pick) => pickCard(pick))}
              </RoutineGroup>
            ))}
            {(groups && groups.other.length > 0) || ownHabits.length > 0 ? (
              <RoutineGroup label={ROUTINE_OTHER_GROUP}>
                {groups?.other.map((pick) => pickCard(pick))}
                {ownHabits.map((habit, i) => (
                  <RoutineCard
                    key={habit.habitId}
                    pick={{habitName: habit.habitName, icon: habit.icon, reason: OWN_HABIT_REASON}}
                    index={i}
                    selected={false}
                    added
                    disabled
                    reduceMotion={reduceMotion}
                    onToggle={() => {}}
                  />
                ))}
              </RoutineGroup>
            ) : null}
            {plan.picks.length > 0 && (
              <View style={styles.reminder}>
                <RoutineReminder
                  on={reminderOn}
                  time={reminderTime}
                  pickerAvailable={pickerAvailable}
                  disabled={running}
                  onToggle={setReminderOn}
                  onTime={setReminderTime}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {phase !== 'building' && (
        <View style={styles.footer}>
          {phase === 'questions' && (
            <>
              <PressButton label={CONTINUE} enabled={continueOn} reduceMotion={reduceMotion} onPress={nextQuestion} />
              {canSkip(step) && (
                <Pressable style={styles.textButton} onPress={skipQuestion} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.textButtonText}>{SKIP_THIS_ONE}</Text>
                </Pressable>
              )}
            </>
          )}

          {phase === 'toldUs' && <PressButton label={CONTINUE} enabled reduceMotion={reduceMotion} onPress={() => setPhase('profile')} />}
          {phase === 'profile' && <PressButton label={CONTINUE} enabled reduceMotion={reduceMotion} onPress={() => setPhase('routine')} />}

          {phase === 'routine' && plan && (
            <>
              {createFailed && <Text style={styles.error} accessibilityLiveRegion="polite">{CREATE_FAILED}</Text>}
              <PressButton label={plan.picks.length > 0 ? START : DONE} enabled={!running} reduceMotion={reduceMotion} onPress={start} />
              <PressButton label={ADD_OWN_HABIT} variant="secondary" enabled={!running} reduceMotion={reduceMotion} onPress={addOwnHabit} />
            </>
          )}
        </View>
      )}

      <SkipDialog state={skipState} copy={skipCopy(anyCreated)} reduceMotion={reduceMotion} onEvent={onSkipEvent} />
    </SafeAreaView>
  );
}

// Continue, Start, Done (primary) and Add your own habit (secondary): scale to 0.97 while pressed
function PressButton({label, enabled, onPress, reduceMotion, variant = 'primary'}: {
  label: string;
  enabled: boolean;
  onPress: () => void;
  reduceMotion: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const scale = useSharedValue(1);
  const pressTo = (down: boolean) => {
    if (!shouldAnimate(reduceMotion) || !enabled) return;
    scale.set(withTiming(down ? BUTTON_PRESS_SCALE : 1, {
      duration: down ? BUTTON_PRESS_IN_MS : BUTTON_PRESS_OUT_MS, easing: Easing.out(Easing.quad), reduceMotion: SYSTEM,
    }));
  };
  const style = useAnimatedStyle(() => ({transform: [{scale: scale.get()}]}));
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => pressTo(true)}
      onPressOut={() => pressTo(false)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{disabled: !enabled}}>
      <Animated.View style={[primary ? styles.primary : styles.secondary, !enabled && (primary ? styles.primaryOff : styles.off), style]}>
        <Text style={primary ? styles.primaryText : styles.secondaryText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl},
  // 36: at least Space Grotesk Bold's natural line height (1.276 em = 35.7 at 28), so Android never trims line 1
  title: {fontFamily: fonts.title, fontSize: 28, lineHeight: 36, color: colors.text},
  hint: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: spacing.sm},
  notice: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: spacing.sm},
  options: {gap: spacing.sm, marginTop: spacing.xl},
  routine: {gap: spacing.sm},
  reminder: {marginTop: spacing.lg},
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
  textButton: {alignSelf: 'center', paddingVertical: spacing.sm},
  textButtonText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  error: {fontFamily: fonts.medium, fontSize: 13, color: colors.error, textAlign: 'center'},
});
