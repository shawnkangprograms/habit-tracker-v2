import {useEffect} from 'react';
import {AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Animated, {ReduceMotion, ZoomIn} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Burst} from '@/components/burst';
import {LevelBadge} from '@/components/stats-card';
import {Medal} from '@/components/medal';
import {successHaptic} from '@/services/haptics';
import {colors, fonts, medalTiers, radii, spacing} from '@/constants/theme';
import type {MedalTier} from '@/utils/medals';

export type OverlayItem =
  | {kind: 'levelUp'; level: number; title: string; body: string}
  | {kind: 'streak'; days: number; tier: MedalTier; title: string; body: string};

// Full-screen celebration for a level up or a streak milestone. Mounted only while showing (never kept
// hidden), as a transparent Modal so it also covers the tab bar. Android back = Continue.
// Under Reduce Motion: no particles and no zoom, just the static card.
export function CelebrationOverlay({item, reduceMotion, onContinue}: {
  item: OverlayItem;
  reduceMotion: boolean;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();// the app's provider; the Modal covers the same full screen

  useEffect(() => {
    successHaptic();
    AccessibilityInfo.announceForAccessibility(`${item.title}. ${item.body}`);
  }, [item]);

  const burstColors = item.kind === 'streak'
    ? [medalTiers[item.tier].light, medalTiers[item.tier].base, colors.accent]
    : [colors.accent, colors.amber, colors.text];

  return (
    <Modal
      visible
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onContinue}>
      {/* edge to edge (translucent bars): the insets keep the card, and Continue, clear of the notch,
          the status bar, the home indicator and the Android navigation bar; it scrolls on a large font */}
      <ScrollView
        style={styles.backdrop}
        contentContainerStyle={[styles.backdropContent, {
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          paddingLeft: insets.left + spacing.lg,
          paddingRight: insets.right + spacing.lg,
        }]}
        bounces={false}>
        <Animated.View
          style={styles.card}
          entering={reduceMotion ? undefined : ZoomIn.duration(250).reduceMotion(ReduceMotion.System)}>
          <View style={styles.hero}>
            {!reduceMotion && <Burst colors={burstColors} />}
            {item.kind === 'levelUp'
              ? <LevelBadge level={item.level} size={72} />
              : <Medal days={item.days} tier={item.tier} earned daysToGo={0} size={110} />}
          </View>
          <Text style={styles.title} accessibilityRole="header">{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Pressable
            style={({pressed}) => [styles.button, pressed && styles.pressed]}
            onPress={onContinue}
            accessibilityRole="button">
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(10, 9, 8, 0.82)'},
  backdropContent: {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hero: {minHeight: 150, alignItems: 'center', justifyContent: 'center'},
  title: {fontFamily: fonts.title, fontSize: 26, color: colors.text, textAlign: 'center'},
  body: {fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center'},
  button: {
    alignSelf: 'stretch',
    height: 56,
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
  pressed: {opacity: 0.85},
});
