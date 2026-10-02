import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useMotion } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far to shrink on press (0.97 for buttons, 0.985 for large cards). */
  scaleTo?: number;
};

/** Pressable with a subtle spring-scale response. Collapses to opacity when Reduce Motion is on. */
export function PressableScale({ scaleTo = 0.97, style, onPressIn, onPressOut, disabled, ...rest }: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const { spring, reduced } = useMotion();
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 - (1 - scaleTo) * pressed.value }],
    opacity: reduced ? 1 - 0.25 * pressed.value : 1,
  }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
      onPressIn={(e) => {
        pressed.value = spring(1);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = spring(0);
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}
