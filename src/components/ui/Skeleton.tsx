import { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

/** Calm pulsing placeholder. Static when Reduce Motion is on. */
export function Skeleton({
  width = '100%',
  height = 16,
  rounded = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [reduced, t]);
  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [c.skeleton, c.skeletonHighlight]),
  }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: rounded }, animated, style]}
    />
  );
}
