import {StyleSheet, View} from 'react-native';
import {colors} from '@/constants/theme';

// Thin orange progress bar. The fill is a scaleX transform from the left edge, so stage 4 can animate it on the
// UI thread without changing layout.
export function ProgressBar({progress}: {progress: number}) {
  const scale = Math.min(1, Math.max(0, progress));
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, {transform: [{scaleX: scale}]}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {height: 4, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden'},
  fill: {flex: 1, borderRadius: 2, backgroundColor: colors.accent, transformOrigin: 'left'},
});
