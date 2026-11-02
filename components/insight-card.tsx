import {Component, useState, type ReactNode} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {FadeIn, ReduceMotion} from 'react-native-reanimated';
import {useInsight} from '@/hooks/use-insight';
import {cardContent} from '@/utils/insightSchedule';
import {getLocalDateString} from '@/utils/dates';
import {colors, fonts, radii, spacing} from '@/constants/theme';

// A render error anywhere in the card hides the card; Home keeps working
class InsightErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};

  static getDerivedStateFromError() {
    return {failed: true};
  }

  componentDidCatch(err: unknown) {
    console.log('Insight card render failed', err);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function InsightCardBody({userId}: {userId: string}) {
  const view = useInsight(userId);
  const [expanded, setExpanded] = useState(false);
  if (!view) return null;// cache not read yet
  const content = cardContent(view, getLocalDateString());
  if (content.kind === 'hidden') return null;

  if (content.kind === 'message') {
    return (
      <Animated.View style={[styles.card, styles.row]} entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}>
        <MaterialCommunityIcons name="lightbulb-outline" size={20} color={colors.muted} />
        <Text style={[styles.message, styles.flex]}>{content.text}</Text>
      </Animated.View>
    );
  }

  const {insight, label} = content;
  return (
    <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}>
      <Pressable
        style={({pressed}) => [styles.card, pressed && styles.pressed]}
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityState={{expanded}}
        accessibilityLabel={`Insight, ${label}. ${insight.teaser}`}
        accessibilityHint={expanded ? 'Hides the full insight' : 'Shows the full insight'}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={colors.accent} />
          <View style={styles.flex}>
            <Text style={styles.label}>Insight · {label}</Text>
            <Text style={styles.teaser}>{insight.teaser}</Text>
          </View>
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
        </View>
        {expanded && <Text style={styles.detail}>{insight.detail}</Text>}
      </Pressable>
    </Animated.View>
  );
}

// Home's AI insight: collapsed teaser, tap to expand. Shows nothing until the cache is read after Home is usable,
// and nothing at all if anything inside fails (see InsightErrorBoundary and utils/insightSchedule.ts).
export function InsightCard({userId}: {userId: string}) {
  return (
    <InsightErrorBoundary>
      <InsightCardBody userId={userId} />
    </InsightErrorBoundary>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {opacity: 0.8},
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  flex: {flex: 1, gap: 2},
  label: {fontFamily: fonts.semiBold, fontSize: 11, color: colors.muted},
  teaser: {fontFamily: fonts.title, fontSize: 14, color: colors.text},
  detail: {fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.text},
  message: {fontFamily: fonts.regular, fontSize: 13, color: colors.muted},
});
