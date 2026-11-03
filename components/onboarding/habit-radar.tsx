import {View} from 'react-native';
import Svg, {Line, Polygon, Text as SvgText} from 'react-native-svg';
import {colors, fonts} from '@/constants/theme';
import {polygonPoints, radarPoint} from '@/utils/onboarding/radar';
import {AXIS_MAX, RADAR_BASELINE, radarValues, type Scores} from '@/utils/onboarding/scoring';
import {AXES} from '@/utils/onboarding/types';

// The Habit Profile radar: six axes in the Figma order (Learning at the top, then clockwise), the user's scores
// as a filled polygon, and the fixed 2/5 baseline as a dashed one. Static here; stage 4 draws it out.

const SIZE = 280;
const C = SIZE / 2;
const RADIUS = 92;
const LABEL_GAP = 20;
const FULL = AXES.map(() => 1);
const BASELINE = AXES.map(() => RADAR_BASELINE / AXIS_MAX);

export function HabitRadar({scores}: {scores: Scores}) {
  const label = AXES.map((axis) => `${axis} ${scores[axis]} of ${AXIS_MAX}`).join(', ');
  return (
    <View style={{width: SIZE, height: SIZE, alignSelf: 'center'}} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {AXES.map((axis, i) => {
          const end = radarPoint(i, AXES.length, 1, RADIUS, C, C);
          return <Line key={axis} x1={C} y1={C} x2={end.x} y2={end.y} stroke={colors.border} strokeWidth={1} />;
        })}
        <Polygon points={polygonPoints(FULL, RADIUS, C, C)} fill="none" stroke={colors.border} strokeWidth={1.5} />
        <Polygon points={polygonPoints(BASELINE, RADIUS, C, C)} fill="none" stroke={colors.muted} strokeWidth={1} strokeDasharray="4 4" />
        <Polygon
          points={polygonPoints(radarValues(scores), RADIUS, C, C)}
          fill={colors.accent}
          fillOpacity={0.25}
          stroke={colors.accent}
          strokeWidth={2}
        />
        {AXES.map((axis, i) => {
          const p = radarPoint(i, AXES.length, 1, RADIUS + LABEL_GAP, C, C);
          const anchor = Math.abs(p.x - C) < 1 ? 'middle' : p.x < C ? 'end' : 'start';
          const dy = p.y < C - 1 ? -2 : p.y > C + 1 ? 10 : 4;// keep top and bottom labels clear of the shape
          return (
            <SvgText key={axis} x={p.x} y={p.y + dy} textAnchor={anchor} fill={colors.muted} fontSize={12} fontFamily={fonts.semiBold}>
              {axis}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
