import {ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle} from 'react-native';

import {colors} from '@/constants/theme';
import {buttonA11y, buttonSpec, hitSlopFor, type ButtonSize, type ButtonVariant} from '@/utils/ui/controls';
import {AppText} from '@/components/ui/app-text';

// A pill button. While `loading` the visible label is replaced by a spinner but keeps its space (the button doesn't
// resize) and stays the accessible name. Pressed = opacity 0.85 (not animated, so nothing to switch off for "reduce
// motion"); disabled = opacity 0.4. A control shorter than 48 dp gets hitSlop up to 48 (the visible size changes in C2).
export function Button({label, onPress, variant = 'primary', size = 'md', loading = false, disabled = false, style, testID,
  accessibilityLabel, accessibilityHint, hitSlop}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;// from constants/testIds.ts
  accessibilityLabel?: string;
  accessibilityHint?: string;
  hitSlop?: PressableProps['hitSlop'];
}) {
  const spec = buttonSpec(variant, size);
  const off = disabled || loading;
  return (
    <Pressable
      style={({pressed}) => [
        styles.base,
        {
          height: spec.height, paddingHorizontal: spec.paddingHorizontal, borderRadius: spec.borderRadius,
          backgroundColor: spec.backgroundColor,
          ...(spec.borderColor ? {borderWidth: spec.borderWidth, borderColor: spec.borderColor} : {}),
        },
        style,
        disabled && styles.disabled,
        pressed && !off && styles.pressed,
      ]}
      onPress={onPress}
      disabled={off}
      hitSlop={hitSlop ?? hitSlopFor(spec.height)}
      accessibilityHint={accessibilityHint}
      testID={testID}
      {...buttonA11y(label, accessibilityLabel, disabled, loading)}>
      <AppText
        variant={spec.step}
        weight={spec.weight}
        color={spec.textColor}
        style={loading ? styles.hidden : undefined}>
        {label}
      </AppText>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={colors[spec.textColor]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {alignItems: 'center', justifyContent: 'center'},
  disabled: {opacity: 0.4},
  pressed: {opacity: 0.85},
  hidden: {opacity: 0},
  spinner: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center'},
});
