import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';

export type AuditEntry = {
  id: string;
  adminUid: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  at: Date | null;
};

type GlyphName = keyof typeof MaterialCommunityIcons.glyphMap;

const ACTIONS: Record<string, {verb: string; icon: GlyphName}> = {
  create: {verb: 'Created', icon: 'plus-circle-outline'},
  update: {verb: 'Updated', icon: 'pencil-outline'},
  delete: {verb: 'Deleted', icon: 'trash-can-outline'},
  disable: {verb: 'Disabled', icon: 'account-cancel-outline'},
  enable: {verb: 'Enabled', icon: 'account-check-outline'},
};

const TARGET_LABELS: Record<string, string> = {catalog: 'Catalog', user: 'User'};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "just now", "5m ago", "3h ago", "2d ago", then "9 Oct 2026" (local time)
function timeAgo(at: Date | null): string {
  if (!at) return 'time unknown';
  const minutes = Math.floor((Date.now() - at.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d ago`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}

// One audit entry: "Created Drink water" / "Catalog · 2h ago · by you". Never shows emails.
export function AdminLogRow({entry, myUid, last}: {entry: AuditEntry; myUid?: string; last?: boolean}) {
  const action = ACTIONS[entry.action] ?? {verb: entry.action || 'Changed', icon: 'history' as GlyphName};
  const target = entry.targetName || entry.targetId.slice(0, 8) || 'unknown';
  const by = entry.adminUid === myUid ? 'you' : entry.adminUid.slice(0, 8) || 'unknown';
  const meta = [TARGET_LABELS[entry.targetType] ?? entry.targetType, timeAgo(entry.at), `by ${by}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={styles.badge}>
        <MaterialCommunityIcons name={action.icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.details}>
        <Text style={styles.title} numberOfLines={1}>
          {action.verb} <Text style={styles.target}>{target}</Text>
        </Text>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md},
  divider: {borderBottomWidth: 1, borderBottomColor: colors.border},
  badge: {
    width: 34,
    height: 34,
    borderRadius: radii.iconBadge,
    backgroundColor: `${colors.accent}1f`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {flex: 1, gap: 2},
  title: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
  target: {fontFamily: fonts.semiBold, color: colors.text},
  meta: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
});
