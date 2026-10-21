import {useCallback} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Pressable, ScrollView, StyleSheet, Switch, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {signOut} from '@/services/authActions';
import {useIsAdmin} from '@/services/adminContext';
import {getFirebaseAuth} from '@/services/authInit';
import {setCelebrationsEnabled, useCelebrationsEnabled} from '@/services/celebrationPrefs';
import {devSeedEarlyPraise} from '@/db/devSeed';// null outside __DEV__
import {colors, fonts, radii, spacing} from '@/constants/theme';

// DEV ONLY: long-press the title to seed early-praise history (logs first, a second long press confirms)
const devSeed = devSeedEarlyPraise;
const onTitleLongPress = devSeed
    ? () => { devSeed(getFirebaseAuth().currentUser?.uid); }
    : undefined;

export default function SettingsScreen (){
    const {isAdmin, recheckIfFailed} = useIsAdmin();
    const celebrationsOn = useCelebrationsEnabled();

    // if the sign-in admin check failed for a network reason, try again whenever Settings gains focus
    useFocusEffect(useCallback(() => {
        recheckIfFailed();
    }, [recheckIfFailed]));

    return(
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.title} onLongPress={onTitleLongPress}>Settings</Text>

              <View style={styles.list}>
                <View style={styles.row}>
                  <MaterialCommunityIcons name="party-popper" size={22} color={colors.accent} />
                  <Text style={styles.rowText}>Celebrations and messages</Text>
                  {/* fixed, centred box: the row lays out the same whatever size the native switch reports */}
                  <View style={styles.switchBox}>
                    <Switch
                      value={celebrationsOn}
                      onValueChange={setCelebrationsEnabled}
                      trackColor={{false: colors.border, true: colors.accent}}
                      thumbColor={colors.white}
                      ios_backgroundColor={colors.border}
                      accessibilityLabel="Celebrations and messages"
                    />
                  </View>
                </View>

                {isAdmin && (
                  <Pressable
                    style={({pressed}) => [styles.row, pressed && styles.pressed]}
                    onPress={() => router.push('/admin/overview')}
                    accessibilityRole="button">
                    <MaterialCommunityIcons name="shield-account-outline" size={22} color={colors.accent} />
                    <Text style={styles.rowText}>Admin</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
                  </Pressable>
                )}

                <Pressable
                  style={({pressed}) => [styles.row, pressed && styles.pressed]}
                  onPress={signOut}
                  accessibilityRole="button">
                  <MaterialCommunityIcons name="logout" size={22} color={colors.error} />
                  <Text style={[styles.rowText, styles.signOutText]}>Sign Out</Text>
                </Pressable>
              </View>
            </ScrollView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: 18, gap: spacing.lg},
  title: {fontFamily: fonts.title, fontSize: 26, color: colors.text, paddingTop: 5},
  list: {gap: 7},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, // only shows when large text makes a row taller than 56
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: {flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  switchBox: {width: 52, height: 32, alignItems: 'center', justifyContent: 'center'},
  signOutText: {color: colors.error},
  pressed: {opacity: 0.85},
});
