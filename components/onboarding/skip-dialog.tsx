import {useEffect, useRef} from 'react';
import {AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import type {SkipCopy, SkipDialogEvent, SkipDialogState} from '@/utils/onboarding/skipDialog';

// The "Skip setup" confirmation and the "Taking you home" notice that follows it, or "Taking you back to Settings…" on
// a retake started from Settings (wording and state rules in utils/onboarding/skipDialog.ts). React Native's own
// Modal, so no new dependency: Android's Back reaches
// onRequestClose, and the dialog is its own window for screen readers. Focus moves to the title when it opens
// and to the notice when it changes. Motion: the Modal's fade only, and none under reduced motion.

export function SkipDialog({state, copy, reduceMotion, onEvent}: {
  state: SkipDialogState;
  copy: SkipCopy;
  reduceMotion: boolean;
  onEvent: (event: SkipDialogEvent) => void;
}) {
  const visible = state === 'confirm' || state === 'leaving';
  const leaving = state === 'leaving';
  const heading = useRef<Text>(null);

  const focusHeading = () => {
    if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
  };
  // the confirm text gives way to the notice inside the same open dialog: move focus with it
  useEffect(() => {
    if (leaving) focusHeading();
  }, [leaving]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      statusBarTranslucent
      onShow={focusHeading}
      onRequestClose={() => onEvent('back')}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          {leaving ? (
            <>
              <Text ref={heading} style={styles.notice} accessibilityLiveRegion="polite">{copy.notice}</Text>
              <DialogButton label={copy.goHome} primary onPress={() => onEvent('goHome')} />
            </>
          ) : (
            <>
              <Text ref={heading} style={styles.title} accessibilityRole="header">{copy.title}</Text>
              <Text style={styles.body}>{copy.body}</Text>
              {/* staying is the main action; leaving is the outlined one */}
              <DialogButton label={copy.no} primary onPress={() => onEvent('no')} />
              <DialogButton label={copy.yes} onPress={() => onEvent('yes')} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DialogButton({label, primary = false, onPress}: {label: string; primary?: boolean; onPress: () => void}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [primary ? styles.primary : styles.secondary, pressed && styles.pressed]}>
      <Text style={primary ? styles.primaryText : styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0, 0, 0, 0.6)'},
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.largeCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {fontFamily: fonts.title, fontSize: 22, lineHeight: 29, color: colors.text},
  body: {fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: spacing.sm},
  notice: {fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 23, color: colors.text, marginBottom: spacing.sm},
  primary: {minHeight: 52, borderRadius: radii.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg},
  primaryText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
  secondary: {
    minHeight: 52, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.accent, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: spacing.lg,
  },
  secondaryText: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.accent},
  pressed: {opacity: 0.85},
});
