import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Floating chrome surface: Liquid Glass on iOS 26+, a material blur on older iOS and web,
 * and a solid translucent fill on Android (where blur is costly over a scrolling grid).
 */
export function GlassSurface({
  style,
  children,
  interactive,
  ...rest
}: ViewProps & { style?: StyleProp<ViewStyle>; interactive?: boolean }) {
  const { scheme, colors } = useTheme();
  if (liquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} colorScheme={scheme} style={style} {...rest}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === 'android') {
    return (
      <View style={[{ backgroundColor: scheme === 'dark' ? 'rgba(28,28,28,0.96)' : 'rgba(255,255,255,0.97)' }, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <View style={[style, { overflow: 'hidden' }]} {...rest}>
      <BlurView
        intensity={60}
        tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(20,20,20,0.55)' : 'rgba(255,255,255,0.6)', borderColor: colors.separator, borderWidth: StyleSheet.hairlineWidth, borderRadius: (StyleSheet.flatten(style)?.borderRadius as number) ?? 0 }]} />
      {children}
    </View>
  );
}
