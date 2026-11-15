import {memo, useId} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop} from 'react-native-svg';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, medalTiers} from '@/constants/theme';
import type {AwardGroup, AwardOrnament} from '@/utils/awards';
import type {MedalTier} from '@/utils/medals';
import {
  FACE, FLAME, FLAME_LEFT, FLAME_RIGHT, FRAMES, LAUREL, RIBBON_LEFT, RIBBON_RIGHT, VIEW_H, VIEW_W, numberScale, type Centre,
} from '@/utils/awardArt';

// One award's artwork (C4 Set 2): its group's frame in the tier's material (a vertical gradient light -> base -> dark),
// a solid face in the tier's light colour, and on it the number or glyph in colors.onAccent ink (every tier: 6.49:1 or
// more, tests/palette.test.ts). Locked: the grey locked material, the dark locked face with muted ink, and a lock under
// the face, so the state never rests on colour alone. The blaze material keeps its glow; the 200 and 365 streaks add
// a second flame and a laurel. Purely visual: the caller gives the spoken label (it is hidden from screen readers).
export const AwardBadge = memo(function AwardBadge({group, tier, earned, centre, ornament = 'none', size = 84}: {
  group: AwardGroup;
  tier: MedalTier;
  earned: boolean;
  centre: Centre;
  ornament?: AwardOrnament;
  size?: number;
}) {
  const height = (size * VIEW_H) / VIEW_W;
  const metal = earned ? medalTiers[tier] : medalTiers.locked;
  const frame = FRAMES[group];
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');// SVG ids must be unique per badge on a screen
  const bodyId = `award-${uid}-body`;
  const glowId = `award-${uid}-glow`;
  const glow = earned && tier === 'blaze';
  const faceFill = earned ? metal.light : medalTiers.locked.dark;
  const ink = earned ? colors.onAccent : colors.muted;
  const laurel = frame.laurel || ornament === 'laurel';
  const flames = frame.flame ? (ornament === 'secondFlame' ? [FLAME_LEFT, FLAME_RIGHT] : [FLAME]) : [];
  const faceTop = ((FACE.cy - FACE.r) / VIEW_H) * height;
  const faceHeight = ((2 * FACE.r) / VIEW_H) * height;

  return (
    <View style={{width: size, height}} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        <Defs>
          <LinearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={metal.light} />
            <Stop offset="0.5" stopColor={metal.base} />
            <Stop offset="1" stopColor={metal.dark} />
          </LinearGradient>
          {glow && (
            <RadialGradient id={glowId} cx="50" cy="60" r="50" gradientUnits="userSpaceOnUse">
              <Stop offset="0.45" stopColor={medalTiers.blaze.glow} stopOpacity="0.45" />
              <Stop offset="1" stopColor={medalTiers.blaze.glow} stopOpacity="0" />
            </RadialGradient>
          )}
        </Defs>
        {glow && <Circle cx="50" cy="60" r="50" fill={`url(#${glowId})`} />}
        {frame.ribbons && <Path d={RIBBON_LEFT} fill={metal.dark} />}
        {frame.ribbons && <Path d={RIBBON_RIGHT} fill={metal.dark} />}
        {laurel && LAUREL.map((leaf) => (
          <Ellipse key={`${leaf.cx}-${leaf.cy}`} cx={leaf.cx} cy={leaf.cy} rx={7} ry={3.2} fill={metal.base} stroke={metal.dark} strokeWidth={1}
            transform={`rotate(${leaf.rotate} ${leaf.cx} ${leaf.cy})`} />
        ))}
        <Path d={frame.body} fill={`url(#${bodyId})`} stroke={metal.dark} strokeWidth={1.5} />
        <Path d={frame.rim} fill="none" stroke={metal.light} strokeWidth={1.5} strokeOpacity={0.7} />
        <Circle cx={FACE.cx} cy={FACE.cy} r={FACE.r} fill={faceFill} stroke={metal.dark} strokeWidth={1.5} />
        {flames.map((d) => (
          <Path key={d} d={d} fill={earned ? colors.accent : metal.light} stroke={earned ? medalTiers.blaze.dark : metal.dark} strokeWidth={1} />
        ))}
      </Svg>

      {/* the number as RN Text, so it uses the app font; centred on the solid face */}
      <View style={[styles.overlay, {top: faceTop, height: faceHeight}]} pointerEvents="none">
        {centre.kind === 'number' ? (
          <Text style={[styles.number, {color: ink, fontSize: size * numberScale(centre.text)}]} allowFontScaling={false}>
            {centre.text}
          </Text>
        ) : (
          <MaterialCommunityIcons name={centre.glyph as never} size={Math.round(size * 0.26)} color={ink} />
        )}
      </View>
      {!earned && (
        <View style={[styles.overlay, {top: faceTop + faceHeight + height * 0.02}]} pointerEvents="none">
          <MaterialCommunityIcons name="lock" size={Math.round(size * 0.15)} color={colors.muted} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center'},
  number: {fontFamily: fonts.title},
});
