import {useEffect, useState} from 'react';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {clearTraces, loadTraces} from '@/services/startupTraceStore';
import {summarise, traceToText, type TraceRecord} from '@/utils/startupTrace';
import {colors, fonts, radii, spacing} from '@/constants/theme';

// Preview build only: the last saved startup traces, opened by a long press on Settings' version line.
// Required lazily by Settings, so other builds never evaluate it. The current launch is saved 10 s after
// Home is usable, so it appears here on a later open, not instantly.
export function StartupTracePanel() {
  const [records, setRecords] = useState<TraceRecord[] | null>(null);

  useEffect(() => {
    loadTraces().then(setRecords);
  }, []);

  const latest = records?.[0];

  const share = () => {
    if (!records || records.length === 0) return;
    Share.share({message: traceToText(records)}).catch(() => {});
  };

  const clear = () => {
    clearTraces().then(() => setRecords([])).catch(() => {});
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title} accessibilityRole="header">Startup trace</Text>

      {records === null && <Text style={styles.muted}>Loading...</Text>}
      {records !== null && !latest && (
        <Text style={styles.muted}>No saved launch yet. It is saved about 10 seconds after Home is usable.</Text>
      )}

      {latest && (
        <>
          <Text style={styles.muted}>
            Launch {latest.launch} · {new Date(latest.at).toLocaleString()} · base {latest.base} · Hermes {latest.hermes}
            {latest.counts ? ` · ${latest.counts.habits} habits, ${latest.counts.completions} rows` : ''}
          </Text>
          {summarise(latest).map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.label}>
                {row.label}
                {row.note ? <Text style={styles.muted}> ({row.note})</Text> : null}
              </Text>
              <Text style={styles.value}>{row.ms === null ? 'n/a' : `${row.ms} ms`}</Text>
            </View>
          ))}

          {records && records.length > 1 && (
            <>
              <Text style={styles.subtitle}>Earlier launches (JS span to usable)</Text>
              {records.slice(1).map((r) => {
                const usable = r.marks['home:usable'];
                return (
                  <View key={`${r.launch}-${r.at}`} style={styles.row}>
                    <Text style={styles.label}>Launch {r.launch} · {new Date(r.at).toLocaleString()}</Text>
                    <Text style={styles.value}>{usable === undefined ? 'n/a' : `${usable} ms`}</Text>
                  </View>
                );
              })}
            </>
          )}
        </>
      )}

      <View style={styles.buttons}>
        <Pressable style={({pressed}) => [styles.button, pressed && styles.pressed]} onPress={share} accessibilityRole="button">
          <Text style={styles.buttonText}>Share</Text>
        </Pressable>
        <Pressable style={({pressed}) => [styles.button, styles.secondary, pressed && styles.pressed]} onPress={clear} accessibilityRole="button">
          <Text style={[styles.buttonText, styles.secondaryText]}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: {fontFamily: fonts.title, fontSize: 17, color: colors.text},
  subtitle: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginTop: spacing.sm},
  muted: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm},
  label: {flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.text},
  value: {fontFamily: fonts.semiBold, fontSize: 12, color: colors.text},
  buttons: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm},
  button: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border},
  buttonText: {fontFamily: fonts.title, fontSize: 14, color: colors.white},
  secondaryText: {color: colors.text},
  pressed: {opacity: 0.85},
});
