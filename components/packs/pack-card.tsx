import {useEffect, type ReactNode} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {ReduceMotion, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {usePackExpanded} from '@/hooks/use-packs';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {ADD_REST, ADDING, editPackLabel, packProgress} from '@/utils/packs/copy';

// One pack on Home (docs/PACKS_REPORTS_SPEC.md, section 4): name, "{x} of {n} done today", a progress bar and a
// chevron; tapping the header expands or collapses it (expanded by default, remembered for the app run). The
// bar and chevron move with transforms only, and there is no height animation: the habits just appear.
// The rows themselves are Home's own (children), so ticking one works exactly as anywhere else on Home.
// The pencil beside the chevron opens the pack's edit screen; it is its own button, never inside the header's.

export type AddRest = {
  adding: boolean;
  onPress: () => void;
  notice: string | null;// a failure, or the habit limit message while the limit is reached
};

export function PackCard(props: {
  uid: string;
  packId: string;
  name: string;
  done: number;
  total: number;
  hasHabits: boolean;// false: "No habits yet"
  onEdit: () => void;
  addRest: AddRest | null;// null: nothing missing
  children: ReactNode;
}) {
  const [expanded, toggle] = usePackExpanded(props.uid, props.packId);
  const progress = props.total === 0 ? 0 : props.done / props.total;
  const fill = useSharedValue(progress);
  const turn = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(progress, {duration: 300, reduceMotion: ReduceMotion.System});
  }, [progress, fill]);
  useEffect(() => {
    turn.value = withTiming(expanded ? 1 : 0, {duration: 180, reduceMotion: ReduceMotion.System});
  }, [expanded, turn]);

  const fillStyle = useAnimatedStyle(() => ({transform: [{scaleX: Math.min(1, Math.max(0, fill.value))}]}));
  const chevronStyle = useAnimatedStyle(() => ({transform: [{rotate: `${turn.value * 180}deg`}]}));
  const status = packProgress(props.done, props.total, props.hasHabits);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable
          style={({pressed}) => [styles.header, pressed && styles.pressed]}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityState={{expanded}}
          accessibilityLabel={`${props.name}, ${status}`}>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>{props.name}</Text>
            <Text style={styles.status}>{status}</Text>
            <View style={styles.track}>
              <Animated.View style={[styles.fill, fillStyle]} />
            </View>
          </View>
        </Pressable>
        <Pressable
          style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}
          onPress={props.onEdit}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={editPackLabel(props.name)}>
          <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.muted} />
        </Pressable>
        <Pressable
          style={({pressed}) => [styles.iconButton, styles.chevronButton, pressed && styles.pressed]}
          onPress={toggle}
          hitSlop={6}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden>
          <Animated.View style={chevronStyle}>
            <MaterialCommunityIcons name="chevron-down" size={22} color={colors.muted} />
          </Animated.View>
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.body}>
          {props.children}
          {props.addRest && (
            <>
              <Pressable
                style={({pressed}) => [styles.addRow, pressed && styles.pressed]}
                onPress={props.addRest.onPress}
                disabled={props.addRest.adding}
                accessibilityRole="button"
                accessibilityState={{busy: props.addRest.adding, disabled: props.addRest.adding}}>
                {props.addRest.adding
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <MaterialCommunityIcons name="plus" size={20} color={colors.accent} />}
                <Text style={styles.addText}>{props.addRest.adding ? ADDING : ADD_REST}</Text>
              </Pressable>
              {props.addRest.notice && (
                <Text style={styles.notice} accessibilityLiveRegion="polite">{props.addRest.notice}</Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,// no overflow clipping: a row's "+N XP" label rises above it
  },
  headerRow: {flexDirection: 'row', alignItems: 'center'},
  header: {flex: 1, flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingRight: spacing.xs},
  iconButton: {width: 40, height: 44, alignItems: 'center', justifyContent: 'center'},
  chevronButton: {marginRight: spacing.xs},// hidden from screen readers: the header button announces expanded
  headerText: {flex: 1, gap: 3},
  name: {fontFamily: fonts.title, fontSize: 15, color: colors.text},
  status: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
  track: {height: 5, marginTop: 3, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden'},
  fill: {height: '100%', width: '100%', borderRadius: 3, backgroundColor: colors.accent, transformOrigin: 'left'},
  pressed: {opacity: 0.85},
  body: {gap: 7, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm},
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
  },
  addText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.accent},
  notice: {fontFamily: fonts.medium, fontSize: 12, color: colors.muted, paddingHorizontal: spacing.xs},
});
