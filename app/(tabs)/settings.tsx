import {useCallback} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {signOut} from '@/services/authActions';
import {useIsAdmin} from '@/services/adminContext';
import {colors, fonts, radii, spacing} from '@/constants/theme';

export default function SettingsScreen (){
    const {isAdmin, recheckIfFailed} = useIsAdmin();

    // if the sign-in admin check failed for a network reason, try again whenever Settings gains focus
    useFocusEffect(useCallback(() => {
        recheckIfFailed();
    }, [recheckIfFailed]));

    return(
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.title}>Settings</Text>

              <View style={styles.list}>
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
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: {flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  signOutText: {color: colors.error},
  pressed: {opacity: 0.85},
});
