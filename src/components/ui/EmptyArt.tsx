import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

/**
 * A small stack of "prints" fanning out: sunset, sand and sea. Used for first-run empty states.
 * Pure views + gradients, so it's crisp at any size and themable.
 */
export function EmptyArt({ size = 168 }: { size?: number }) {
  const { scheme } = useTheme();
  const reduced = useReducedMotion();
  const fan = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) fan.value = withDelay(120, withSpring(1, { damping: 14, stiffness: 120 }));
  }, [reduced, fan]);

  const w = size * 0.58;
  const h = w * 1.22;
  const frame = scheme === 'dark' ? '#1E1E1E' : '#FFFFFF';
  const prints = [
    { colors: ['#7FC8E8', '#2F6FDB'] as const, rot: -12, x: -size * 0.2 },
    { colors: ['#F7D9A8', '#E8A867'] as const, rot: 10, x: size * 0.2 },
    { colors: ['#FFB27A', '#CC3D25'] as const, rot: 0, x: 0 },
  ];
  return (
    <View style={{ width: size * 1.2, height: h + 24, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {prints.map((p, i) => (
        <Print key={i} fan={fan} rot={p.rot} x={p.x} style={{ width: w, height: h, backgroundColor: frame }}>
          <LinearGradient colors={p.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.photo}>
            {i === 2 && <View style={[styles.sun, { width: w * 0.22, height: w * 0.22, borderRadius: w }]} />}
            {i === 2 && <View style={[styles.sea, { height: h * 0.28 }]} />}
          </LinearGradient>
        </Print>
      ))}
    </View>
  );
}

function Print({ fan, rot, x, style, children }: { fan: SharedValue<number>; rot: number; x: number; style: object; children: React.ReactNode }) {
  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: x * fan.value }, { rotate: `${rot * fan.value}deg` }],
  }));
  return <Animated.View style={[styles.print, style, a]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  print: {
    position: 'absolute',
    padding: 6,
    paddingBottom: 18,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  photo: { flex: 1, borderRadius: radius.sm, overflow: 'hidden' },
  sun: { position: 'absolute', top: '22%', right: '18%', backgroundColor: 'rgba(255,240,200,0.9)' },
  sea: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(30,90,160,0.55)' },
});
