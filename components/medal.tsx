import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Path, RadialGradient, Stop} from 'react-native-svg';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, medalTiers} from '@/constants/theme';
import {daysToGoLabel, type MedalTier} from '@/utils/medals';

// Drawn on a 100 x 120 grid; everything scales with `size` (the width)
const SHIELD = 'M50 20 L84 30 L84 60 Q84 88 50 104 Q16 88 16 60 L16 30 Z';
const RIM = 'M50 27 L77 35 L77 60 Q77 83 50 96 Q23 83 23 60 L23 35 Z';
const RIBBON_LEFT = 'M31 82 L22 118 L31 111 L39 118 L45 90 Z';
const RIBBON_RIGHT = 'M69 82 L78 118 L69 111 L61 118 L55 90 Z';
const FLAME = 'M50 1 C57 8 61 13 60 19 C59 24 55 27 50 27 C45 27 41 24 40 19 C39 14 43 10 46 6 C47 10 48 13 50 14 C51 9 50 5 50 1 Z';

const DARK_TEXT_TIERS: MedalTier[] = ['silver', 'gold'];// light metals read better with an engraved, dark number

// One streak medal: shield with ribbon, the day count in the middle and a small flame on top.
// Earned medals are in their tier's material; locked ones are grey with a lock and "N days to go".
export const Medal = memo(function Medal(props: {
  days: number;
  tier: MedalTier;
  earned: boolean;
  daysToGo: number;
  size?: number;
}) {
  const {days, tier, earned, daysToGo} = props;
  const size = props.size ?? 84;
  const height = size * 1.2;
  const metal = earned ? medalTiers[tier] : medalTiers.locked;
  const bodyId = `medal-${days}-body`;
  const glowId = `medal-${days}-glow`;
  const glow = earned && tier === 'blaze';

  let numberColor: string = colors.muted;
  if (earned) numberColor = DARK_TEXT_TIERS.includes(tier) ? metal.dark : colors.white;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${days}-day medal, ${earned ? 'earned' : `locked, ${daysToGoLabel(daysToGo)}`}`}>
      <View style={{width: size, height}}>
        <Svg width={size} height={height} viewBox="0 0 100 120">
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
          <Path d={RIBBON_LEFT} fill={metal.dark} />
          <Path d={RIBBON_RIGHT} fill={metal.dark} />
          <Path d={SHIELD} fill={`url(#${bodyId})`} stroke={metal.dark} strokeWidth={1.5} />
          <Path d={RIM} fill="none" stroke={metal.light} strokeWidth={1.5} strokeOpacity={0.7} />
          <Path d={FLAME} fill={earned ? colors.accent : metal.light} stroke={earned ? medalTiers.blaze.dark : metal.dark} strokeWidth={1} />
        </Svg>

        {/* the number as RN Text, so it uses the app font */}
        <View style={[styles.overlay, {top: height * 0.33, height: height * 0.3}]} pointerEvents="none">
          <Text
            style={[styles.number, {color: numberColor, fontSize: size * (days >= 100 ? 0.24 : 0.3)}]}
            allowFontScaling={false}>
            {days}
          </Text>
        </View>
        {!earned && (
          <View style={[styles.overlay, {top: height * 0.63}]} pointerEvents="none">
            <MaterialCommunityIcons name="lock" size={Math.round(size * 0.15)} color={colors.muted} />
          </View>
        )}
      </View>

      <Text style={[styles.caption, earned && styles.captionEarned]}>
        {earned ? `${days} days` : daysToGoLabel(daysToGo)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', gap: 4},
  overlay: {position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center'},
  number: {fontFamily: fonts.title},
  caption: {fontFamily: fonts.medium, fontSize: 11, color: colors.muted, textAlign: 'center'},
  captionEarned: {color: colors.text},
});
