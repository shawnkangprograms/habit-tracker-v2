import {StyleSheet, Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, fonts, spacing} from '@/constants/theme';

// Placeholder until the Summary screen (day/week/month/year) is built
export default function SummaryScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Summary</Text>
      <Text style={styles.subtitle}>Your progress will appear here.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  title: {
    fontFamily: fonts.title,
    fontSize: 28,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.muted,
  },
});
