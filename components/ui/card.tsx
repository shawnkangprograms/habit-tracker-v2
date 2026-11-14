import {StyleSheet, View, type ViewProps} from 'react-native';

import {colors, radii} from '@/constants/theme';

// A bordered surface (the notice boxes in Settings). A plain View: every View prop passes through and no role is
// added. For a tappable card, wrap it in a Pressable that carries the role, label and testID.
export function Card({padding, gap, style, ...rest}: ViewProps & {padding?: number; gap?: number}) {
  return <View style={[styles.card, padding !== undefined && {padding}, gap !== undefined && {gap}, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {borderRadius: radii.habitCard, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
});
