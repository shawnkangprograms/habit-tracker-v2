import {Text, type TextProps} from 'react-native';

import {textStyle, type ColorKey, type Variant, type Weight} from '@/constants/typography';

// The app's text: a size from the type scale (constants/typography.ts), one of the five registered faces, and a colour
// from the palette. No lineHeight unless the caller passes one in `style`. Every Text prop (testID, accessibility*,
// onLongPress, numberOfLines...) passes straight through; no role is added.
export function AppText({variant = 'body', weight, color, style, ...rest}: TextProps & {
  variant?: Variant;
  weight?: Weight;
  color?: ColorKey;
}) {
  return <Text style={[textStyle(variant, weight, color), style]} {...rest} />;
}
