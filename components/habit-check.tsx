import {useEffect, useRef} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {useAnimatedStyle, useSharedValue, withSequence, withTiming} from 'react-native-reanimated';
import {colors, radii} from '@/constants/theme';

// Today's check circle on a Home habit card. Pulses once when it becomes done (not on first render,
// and not under reduce motion). Un-checking just clears it.
export function HabitCheck(props: {
  done: boolean;
  habitName: string;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const wasDone = useRef(props.done);

  useEffect(() => {
    if (props.done && !wasDone.current && !props.reduceMotion) {
      scale.value = withSequence(withTiming(1.2, {duration: 120}), withTiming(1, {duration: 160}));
    }
    wasDone.current = props.done;
  }, [props.done, props.reduceMotion, scale]);

  const pulseStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  return (
    <Pressable
      hitSlop={12}
      accessibilityRole="checkbox"
      accessibilityState={{checked: props.done}}
      accessibilityLabel={`Mark ${props.habitName} as ${props.done ? 'not done' : 'done'}`}
      onPress={props.onPress}>
      <Animated.View style={[styles.check, props.done && styles.checkDone, pulseStyle]}>
        {props.done && <MaterialCommunityIcons name="check" size={17} color={colors.white} />}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {backgroundColor: colors.green, borderColor: colors.green},
});
