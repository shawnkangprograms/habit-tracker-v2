import type {ReactNode} from 'react';
import {ScrollView, View, type StyleProp, type ViewStyle} from 'react-native';
import {SafeAreaView, type Edge} from 'react-native-safe-area-context';

import {colors} from '@/constants/theme';

// A screen: the background, the safe area (`edges`, default top and sides: the tab bar covers the bottom) and, unless
// scroll is false, a ScrollView. `padding` is the side gutter and `gap` the space between children; `contentStyle`
// adds anything else to the content container.
export function Screen({children, scroll = true, edges = ['top', 'left', 'right'], padding, gap, contentStyle, testID}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: readonly Edge[];
  padding?: number;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;// from constants/testIds.ts
}) {
  const content: StyleProp<ViewStyle> = [
    padding !== undefined && {paddingHorizontal: padding},
    gap !== undefined && {gap},
    contentStyle,
  ];
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={edges} testID={testID}>
      {scroll ? <ScrollView contentContainerStyle={content}>{children}</ScrollView> : <View style={[{flex: 1}, content]}>{children}</View>}
    </SafeAreaView>
  );
}
