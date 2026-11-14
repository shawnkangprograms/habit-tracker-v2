// Stage 0b: onboarding straight after sign-up (services/onboardingLaunch.ts), the "Skip setup" confirmation
// (utils/onboarding/skipDialog.ts), the Building Profile quote rule (utils/onboarding/motion.ts) and the Q11
// slider's mapping (utils/onboarding/slider.ts). Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {SkipDialogEvent, SkipDialogState} from '../utils/onboarding/skipDialog.ts';

const {createOnboardingLaunch} = await import('../services/onboardingLaunch.ts');
const sd = await import('../utils/onboarding/skipDialog.ts');
const m = await import('../utils/onboarding/motion.ts');
const sl = await import('../utils/onboarding/slider.ts');
const g = await import('../utils/onboarding/gate.ts');
const c = await import('../utils/onboarding/copy.ts');

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('onboarding straight after sign-up', () => {
  test('a sign-up launches once: requested, taken by Home, ended when Home is focused again', () => {
    const launch = createOnboardingLaunch();
    assert.equal(launch.takeLaunch(), false);// a returning user: nothing
    launch.beginSignUp();
    assert.equal(launch.isLaunchPending(), true);// the tabs layout hides the tab bar from its first render
    assert.equal(launch.takeLaunch(), true);
    assert.equal(launch.takeLaunch(), true);// a second call in the same mount (dev double render) agrees
    launch.endLaunch();
    assert.equal(launch.takeLaunch(), false);// a later Home mount shows itself
    assert.equal(launch.isLaunchPending(), false);
  });

  test('a failed sign-up clears it, before or after Home took it', () => {
    const before = createOnboardingLaunch();
    before.beginSignUp();
    before.cancelSignUp();
    assert.equal(before.takeLaunch(), false);
    assert.equal(before.isLaunchPending(), false);

    const after = createOnboardingLaunch();
    after.beginSignUp();
    after.takeLaunch();
    after.cancelSignUp();
    assert.equal(after.isLaunching(), false);
  });

  test('the open flag: what keeps Home and the gate from pushing a second copy', () => {
    const launch = createOnboardingLaunch();
    assert.equal(launch.isOpen(), false);
    launch.setOpen(true);
    assert.equal(launch.isOpen(), true);
    launch.setOpen(false);
    assert.equal(launch.isOpen(), false);
    const home = source('../app/(tabs)/index.tsx');
    assert.match(home, /if \(!onboardingLaunch\.isOpen\(\)\) router\.push\('\/onboarding'\)/);
    // never left blank: if onboarding didn't open, Home shows itself after the fallback
    assert.match(home, /if \(onboardingLaunch\.isOpen\(\)\) return;\s*setLaunching\(false\);\s*onboardingLaunch\.endLaunch\(\);/);
    assert.match(source('../hooks/use-onboarding-gate.ts'), /!onboardingLaunch\.isOpen\(\)\) router\.push\('\/onboarding'\)/);
    assert.match(source('../app/onboarding.tsx'), /onboardingLaunch\.setOpen\(true\);\s*return \(\) => onboardingLaunch\.setOpen\(false\);/);
  });

  test('subscribers hear changes only (the tabs layout re-renders when the launch ends)', () => {
    const launch = createOnboardingLaunch();
    let calls = 0;
    const off = launch.subscribe(() => { calls += 1; });
    launch.beginSignUp();
    launch.beginSignUp();// no change
    launch.takeLaunch();
    launch.endLaunch();
    off();
    launch.beginSignUp();
    assert.equal(calls, 3);
  });

  test('the sign-up path: begin before the account exists, cancel only if the account wasn\'t created', () => {
    const actions = source('../services/authActions.js');
    const signUp = actions.slice(actions.indexOf('export async function signUp'), actions.indexOf('export async function signIn'));
    const begin = signUp.indexOf('onboardingLaunch.beginSignUp()');
    assert.ok(begin >= 0 && begin < signUp.indexOf('createUserWithEmailAndPassword('));
    // the orphan-account fix: a profile write that fails no longer rolls back, so onboarding carries on
    assert.equal(signUp.split('onboardingLaunch.cancelSignUp()').length - 1, 1);
    assert.doesNotMatch(signUp, /\.delete\(\)/);
  });

  test('onboarding closes itself when no one is signed in (a rolled-back sign-up)', () => {
    for (const uid of [null, undefined, '']) assert.equal(g.shouldCloseForSession(uid), true, String(uid));
    assert.equal(g.shouldCloseForSession('u1'), false);
    assert.match(source('../app/onboarding.tsx'), /if \(shouldCloseForSession\(userId\)\) closeFlow\(\);\s*\}, \[userId\]\);/);
  });

  test('while launching, Home renders only its background and the tab bar is hidden', () => {
    assert.match(source('../app/(tabs)/index.tsx'), /if \(launching\) return <View style=\{styles\.safe\} \/>;/);
    const tabs = source('../app/(tabs)/_layout.tsx');
    assert.match(tabs, /useSyncExternalStore\(onboardingLaunch\.subscribe, onboardingLaunch\.isLaunchPending\)/);
    assert.match(tabs, /tabBarStyle: launching \? TAB_BAR_HIDDEN : TAB_BAR_STYLE/);
  });
});

describe('"Skip setup" confirmation', () => {
  const run = (events: SkipDialogEvent[], busy = false, from: SkipDialogState = 'closed') =>
    events.reduce<SkipDialogState>((s, e) => sd.skipDialogNext(s, e, busy), from);

  test('open, then No or Back: closed again (same step, answers untouched: the dialog holds none)', () => {
    assert.equal(run(['open']), 'confirm');
    assert.equal(run(['open', 'no']), 'closed');
    assert.equal(run(['open', 'back']), 'closed');
  });

  test('Yes shows the notice; Go home, Back or the timer finish it, once', () => {
    assert.equal(run(['open', 'yes']), 'leaving');
    for (const e of ['goHome', 'timeout', 'back'] as const) assert.equal(run(['open', 'yes', e]), 'done', e);
    assert.equal(run(['open', 'yes', 'timeout', 'goHome', 'open', 'no']), 'done');// final
  });

  test('opening is ignored while habits are being created', () => {
    assert.equal(run(['open'], true), 'closed');
  });

  test('events that do not apply change nothing', () => {
    assert.equal(run(['yes', 'goHome', 'timeout', 'no']), 'closed');
    assert.equal(run(['goHome', 'timeout', 'open'], false, 'confirm'), 'confirm');
    assert.equal(run(['open', 'yes', 'no', 'yes']), 'leaving');
  });

  test('the wording: Skip before any habit exists, Leave after; the same notice either way', () => {
    assert.deepEqual(sd.skipCopy(false), {
      title: c.SKIP_TITLE, body: c.SKIP_BODY, yes: c.SKIP_YES, no: c.SKIP_NO, notice: c.LEAVING_NOTICE, goHome: c.GO_HOME,
    });
    assert.deepEqual(sd.skipCopy(true), {
      title: c.LEAVE_TITLE, body: c.LEAVE_BODY, yes: c.LEAVE_YES, no: c.LEAVE_NO, notice: c.LEAVING_NOTICE, goHome: c.GO_HOME,
    });
    assert.equal(sd.LEAVING_AUTO_MS, 2000);
  });
});

describe('Building Profile quotes', () => {
  test('one swap mid-count, none that would end after the count, none at 100%', () => {
    assert.equal(m.QUOTE_MS, 1200);
    const swaps = [1, 2, 3, 4].map((n) => n * m.QUOTE_MS).filter((t) => t < m.BUILDING_DURATION_MS + 1000);
    const allowed = swaps.filter((t) => m.canStartQuoteSwap(t, false));
    assert.deepEqual(allowed, [1200]);
    assert.equal(m.canStartQuoteSwap(0, true), false);
  });

  test('the boundary: a swap may end exactly as the count does, never after', () => {
    const last = m.BUILDING_DURATION_MS - m.QUOTE_OUT_MS - m.QUOTE_IN_MS;
    assert.equal(m.canStartQuoteSwap(last, false), true);
    assert.equal(m.canStartQuoteSwap(last + 1, false), false);
  });
});

describe('Q11 slider mapping', () => {
  const W = 300;
  const x = (value: number) => sl.SLIDER_THUMB / 2 + ((value - 1) / 9) * W;// the thumb's centre for a value

  test('every value from 1 to 10 is reachable, at the thumb position drawn for it', () => {
    for (let v = 1; v <= 10; v++) assert.equal(sl.sliderValueAt(x(v), W), v);
  });

  test('the padding and beyond clamp to the ends', () => {
    assert.equal(sl.sliderValueAt(0, W), 1);
    assert.equal(sl.sliderValueAt(-50, W), 1);
    assert.equal(sl.sliderValueAt(W + sl.SLIDER_THUMB, W), 10);
    assert.equal(sl.sliderValueAt(W * 3, W), 10);
  });

  test('no value before the track has been laid out', () => {
    assert.equal(sl.sliderValueAt(100, 0), null);
    assert.equal(sl.sliderValueAt(100, Number.NaN), null);
  });

  test('the slider is one Pan from touch-down, built once', () => {
    const slider = source('../components/onboarding/confidence-slider.tsx');
    assert.match(slider, /Gesture\.Pan\(\)\s*\.minDistance\(0\)/);
    assert.doesNotMatch(slider, /Gesture\.(Tap|Race)\(/);
    assert.match(slider, /const gesture = useMemo\(/);
    assert.match(slider, /accessibilityActions=\{\[\{name: 'increment'\}, \{name: 'decrement'\}\]\}/);
  });
});
